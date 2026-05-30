import type * as rdfjs from "@rdfjs/types";
import { Readable } from "node:stream";
import type { EventEmitter } from "node:events";

import type {
  CommitHandler,
  PatchCommitContext,
  Quad,
} from "@/client/quad-store/mod.ts";
import { toRdfjsQuad } from "@/client/quad-store/mod.ts";
import { BufferedRdfjsPatchState } from "@/client/adapters/shared/buffered-rdfjs-store.ts";
import {
  buildGenerationDataPrefix,
  buildPrimaryQuadKey,
} from "./kv/denokv-hexastore-keys.ts";
import {
  DEFAULT_DENOKV_HEXASTORE_INDEXES,
  type DenokvHexastoreIndex,
} from "./kv/denokv-hexastore-index-set.ts";
import { readActiveGeneration } from "./kv/denokv-dataset-generation.ts";
import {
  buildBestMatchCursor,
  matchesPattern,
} from "./kv/denokv-match-selector.ts";

/** MAX_KV_GET_MANY_SIZE is Deno KV's per-call getMany key cap. */
export const MAX_KV_GET_MANY_SIZE = 10;

/**
 * DenokvRdfjsStoreOptions configures DenokvRdfjsStore dependencies.
 */
export interface DenokvRdfjsStoreOptions {
  /** kv is the underlying Deno KV database instance. */
  kv: Deno.Kv;

  /** keyPrefix is the namespace prefix for stored quads. Defaults to ["quads"]. */
  keyPrefix?: Deno.KvKey;

  /**
   * enabledHexastoreIndexes controls which KV secondary-index families are materialized.
   * Defaults to all supported index families.
   */
  enabledHexastoreIndexes?: readonly DenokvHexastoreIndex[];

  /** commitHandler atomically persists buffered patches on commit(). */
  commitHandler?: CommitHandler;
}
/**
 * DenokvRdfjsStore is an RDF/JS Store implementation backed by Deno KV.
 * It supports Comunica SPARQL by implementing match() and buffering mutations until commit().
 */
export class DenokvRdfjsStore implements rdfjs.Store {
  private readonly patchState = new BufferedRdfjsPatchState();

  public constructor(
    private readonly options: DenokvRdfjsStoreOptions,
  ) {}

  public match(
    subject?: rdfjs.Term | null,
    predicate?: rdfjs.Term | null,
    object?: rdfjs.Term | null,
    graph?: rdfjs.Term | null,
  ): rdfjs.Stream<rdfjs.Quad> {
    const keyPrefix = this.options.keyPrefix ?? ["quads"];
    const enabledIndexes = this.options.enabledHexastoreIndexes ??
      DEFAULT_DENOKV_HEXASTORE_INDEXES;

    const pattern = {
      subject: subject ?? null,
      predicate: predicate ?? null,
      object: object ?? null,
      graph: graph ?? null,
    };

    const kv = this.options.kv;
    let scopedDataPrefix: Deno.KvKey | undefined;
    let cursorKind: "index" | "primary" | undefined;
    let indexListIterator: AsyncIterator<Deno.KvEntry<string>> | undefined;
    let primaryListIterator:
      | AsyncIterator<Deno.KvEntry<Quad>>
      | undefined;
    let pendingIndexQuadIds: string[] = [];
    let streamFinished = false;

    const rowStream = new Readable({
      objectMode: true,
      read() {
        void pullMatchBatch().catch((error: Error) => {
          rowStream.destroy(error);
        });
      },
    });

    const initializeMatchStream = async (): Promise<void> => {
      const generationId = await readActiveGeneration(kv, keyPrefix);
      scopedDataPrefix = buildGenerationDataPrefix(keyPrefix, generationId);
      const cursor = buildBestMatchCursor(
        scopedDataPrefix,
        enabledIndexes,
        pattern,
      );
      cursorKind = cursor.kind;

      if (cursor.kind === "index") {
        indexListIterator = kv.list<string>(cursor.selector)[
          Symbol.asyncIterator
        ]();
      } else {
        primaryListIterator = kv.list<Quad>(cursor.selector)[
          Symbol.asyncIterator
        ]();
      }
    };

    const pushPrimaryQuadsByIds = async (
      quadIds: readonly string[],
    ): Promise<boolean> => {
      if (!scopedDataPrefix) return false;

      for (
        let offset = 0;
        offset < quadIds.length;
        offset += MAX_KV_GET_MANY_SIZE
      ) {
        const quadIdBatch = quadIds.slice(
          offset,
          offset + MAX_KV_GET_MANY_SIZE,
        );
        const keys = quadIdBatch.map((quadId) =>
          buildPrimaryQuadKey(scopedDataPrefix!, quadId)
        );
        const entries = await kv.getMany(keys) as Array<
          Deno.KvEntryMaybe<Quad>
        >;

        for (let entryIndex = 0; entryIndex < entries.length; entryIndex++) {
          const entry = entries[entryIndex];
          if (!entry.value) continue;
          const storedQuad = toRdfjsQuad(entry.value);
          if (!matchesPattern(storedQuad, pattern)) continue;
          if (!rowStream.push(storedQuad)) {
            pendingIndexQuadIds = quadIdBatch.slice(entryIndex);
            return false;
          }
        }
      }

      return true;
    };

    const pullMatchBatch = async (): Promise<void> => {
      if (streamFinished) return;

      if (!scopedDataPrefix) {
        await initializeMatchStream();
      }

      if (pendingIndexQuadIds.length > 0) {
        const pendingIds = pendingIndexQuadIds;
        pendingIndexQuadIds = [];
        const canContinue = await pushPrimaryQuadsByIds(pendingIds);
        if (!canContinue) return;
      }

      while (!streamFinished && (indexListIterator || primaryListIterator)) {
        if (cursorKind === "index" && indexListIterator) {
          const indexQuadIds: string[] = [];

          for (
            let batchCount = 0;
            batchCount < MAX_KV_GET_MANY_SIZE;
            batchCount += 1
          ) {
            const nextEntry = await indexListIterator.next();
            if (nextEntry.done) {
              streamFinished = true;
              break;
            }
            if (nextEntry.value.value) {
              indexQuadIds.push(nextEntry.value.value);
            }
          }

          if (indexQuadIds.length > 0) {
            const canContinue = await pushPrimaryQuadsByIds(indexQuadIds);
            if (!canContinue) return;
          }

          if (streamFinished) {
            rowStream.push(null);
            return;
          }

          return;
        }

        let pushedAny = false;

        if (!primaryListIterator) {
          return;
        }

        for (
          let batchCount = 0;
          batchCount < MAX_KV_GET_MANY_SIZE;
          batchCount += 1
        ) {
          const nextEntry = await primaryListIterator.next();
          if (nextEntry.done) {
            streamFinished = true;
            break;
          }
          if (!nextEntry.value.value) continue;

          const storedQuad = toRdfjsQuad(nextEntry.value.value);
          if (!matchesPattern(storedQuad, pattern)) continue;

          pushedAny = true;
          if (!rowStream.push(storedQuad)) {
            return;
          }
        }

        if (streamFinished) {
          rowStream.push(null);
          return;
        }

        if (!pushedAny) {
          continue;
        }

        return;
      }

      if (streamFinished) {
        rowStream.push(null);
      }
    };

    return rowStream as unknown as rdfjs.Stream<rdfjs.Quad>;
  }

  /**
   * countQuads returns the number of quads matching the given quad pattern (Comunica cardinality hint).
   */
  public countQuads(
    subject?: rdfjs.Term | null,
    predicate?: rdfjs.Term | null,
    object?: rdfjs.Term | null,
    graph?: rdfjs.Term | null,
  ): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      const stream = this.match(subject, predicate, object, graph);
      let count = 0;
      stream.on("data", () => {
        count += 1;
      });
      stream.on("end", () => resolve(count));
      stream.on("error", reject);
    });
  }

  public add(quad: rdfjs.Quad): this {
    this.patchState.add(quad);
    return this;
  }

  public addQuad(quad: rdfjs.Quad): this {
    this.patchState.addQuad(quad);
    return this;
  }

  public addQuads(quads: rdfjs.Quad[]): this {
    this.patchState.addQuads(quads);
    return this;
  }

  public delete(quad: rdfjs.Quad): this {
    this.patchState.delete(quad);
    return this;
  }

  public removeQuad(quad: rdfjs.Quad): this {
    return this.delete(quad);
  }

  public removeQuads(quads: rdfjs.Quad[]): this {
    this.patchState.removeQuads(quads);
    return this;
  }

  public import(stream: rdfjs.Stream<rdfjs.Quad>): EventEmitter {
    return this.patchState.import(stream);
  }

  public remove(stream: rdfjs.Stream<rdfjs.Quad>): EventEmitter {
    return this.patchState.remove(stream);
  }

  public removeMatches(
    subject?: rdfjs.Term | null,
    predicate?: rdfjs.Term | null,
    object?: rdfjs.Term | null,
    graph?: rdfjs.Term | null,
  ): EventEmitter {
    return this.patchState.removeMatches(
      this.match.bind(this),
      subject,
      predicate,
      object,
      graph,
    );
  }

  /**
   * deleteGraph buffers all quads in the named graph for deletion on commit.
   */
  public deleteGraph(graph: rdfjs.Term | string): EventEmitter {
    return this.patchState.deleteGraph(this.match.bind(this), graph);
  }

  /**
   * commit persists buffered insertions and deletions through the configured CommitHandler.
   */
  public async commit(context?: PatchCommitContext): Promise<void> {
    await this.patchState.flushCommit(this.options.commitHandler, context);
  }
}
