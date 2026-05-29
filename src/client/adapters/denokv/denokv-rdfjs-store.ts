import type * as rdfjs from "@rdfjs/types";
import { DataFactory } from "n3";
import { Readable } from "node:stream";
import { EventEmitter } from "node:events";

import type { DenokvQuadStoreOptions } from "./denokv-quad-store.ts";
import { MAX_KV_GET_MANY_SIZE } from "./denokv-quad-store.ts";
import type { SerializedQuad } from "./denokv-serialization.ts";
import { deserializeQuad } from "./denokv-serialization.ts";
import { hashQuad } from "@/client/quad-store/mod.ts";
import {
  buildGenerationDataPrefix,
  buildPrimaryQuadKey,
} from "./denokv-hexastore-keys.ts";
import {
  DEFAULT_DENOKV_HEXASTORE_INDEXES,
} from "./denokv-hexastore-index-set.ts";
import { readActiveGeneration } from "./denokv-dataset-generation.ts";
import { commitBatchedKvMutations } from "./denokv-kv-limits.ts";
import { materializeQuadKeys } from "./denokv-quad-keys.ts";
import {
  buildBestMatchCursor,
  matchesPattern,
} from "./denokv-match-selector.ts";

const { namedNode } = DataFactory;

/**
 * DenokvRdfjsStore is an RDF/JS Store implementation backed by Deno KV.
 * It supports Comunica SPARQL by implementing match() and buffering mutations until commit().
 */
export class DenokvRdfjsStore implements rdfjs.Store {
  private insertBuffer: rdfjs.Quad[] = [];
  private deleteBuffer: rdfjs.Quad[] = [];

  public constructor(
    private readonly options: DenokvQuadStoreOptions,
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
      | AsyncIterator<Deno.KvEntry<SerializedQuad>>
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
        primaryListIterator = kv.list<SerializedQuad>(cursor.selector)[
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
          Deno.KvEntryMaybe<SerializedQuad>
        >;

        for (let entryIndex = 0; entryIndex < entries.length; entryIndex++) {
          const entry = entries[entryIndex];
          if (!entry.value) continue;
          const storedQuad = deserializeQuad(entry.value);
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

          const storedQuad = deserializeQuad(nextEntry.value.value);
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
    this.insertBuffer.push(quad);
    return this;
  }

  public addQuad(quad: rdfjs.Quad): this {
    return this.add(quad);
  }

  public addQuads(quads: rdfjs.Quad[]): this {
    for (const q of quads) {
      this.insertBuffer.push(q);
    }
    return this;
  }

  public delete(quad: rdfjs.Quad): this {
    this.deleteBuffer.push(quad);
    return this;
  }

  public removeQuad(quad: rdfjs.Quad): this {
    return this.delete(quad);
  }

  public removeQuads(quads: rdfjs.Quad[]): this {
    for (const q of quads) {
      this.deleteBuffer.push(q);
    }
    return this;
  }

  public import(stream: rdfjs.Stream<rdfjs.Quad>): EventEmitter {
    const emitter = new EventEmitter();
    stream.on("data", (q: rdfjs.Quad) => {
      this.insertBuffer.push(q);
    });
    stream.on("end", () => {
      emitter.emit("end");
    });
    stream.on("error", (err: Error) => {
      emitter.emit("error", err);
    });
    return emitter;
  }

  public remove(stream: rdfjs.Stream<rdfjs.Quad>): EventEmitter {
    const emitter = new EventEmitter();
    stream.on("data", (q: rdfjs.Quad) => {
      this.deleteBuffer.push(q);
    });
    stream.on("end", () => {
      emitter.emit("end");
    });
    stream.on("error", (err: Error) => {
      emitter.emit("error", err);
    });
    return emitter;
  }

  public removeMatches(
    subject?: rdfjs.Term | null,
    predicate?: rdfjs.Term | null,
    object?: rdfjs.Term | null,
    graph?: rdfjs.Term | null,
  ): EventEmitter {
    const emitter = new EventEmitter();
    const stream = this.match(subject, predicate, object, graph);
    stream.on("data", (q: rdfjs.Quad) => {
      this.deleteBuffer.push(q);
    });
    stream.on("end", () => {
      emitter.emit("end");
    });
    stream.on("error", (err: Error) => {
      emitter.emit("error", err);
    });
    return emitter;
  }

  /**
   * deleteGraph buffers all quads in the named graph for deletion on commit.
   */
  public deleteGraph(graph: rdfjs.Term | string): EventEmitter {
    const graphTerm = typeof graph === "string" ? namedNode(graph) : graph;
    return this.removeMatches(null, null, null, graphTerm);
  }

  /**
   * commit persists buffered insertions and deletions to Deno KV (primary + enabled secondary indexes).
   */
  public async commit(): Promise<void> {
    if (this.insertBuffer.length === 0 && this.deleteBuffer.length === 0) {
      return;
    }

    const keyPrefix = this.options.keyPrefix ?? ["quads"];
    const enabledIndexes = this.options.enabledHexastoreIndexes ??
      DEFAULT_DENOKV_HEXASTORE_INDEXES;
    const generationId = await readActiveGeneration(
      this.options.kv,
      keyPrefix,
    );
    const scopedDataPrefix = buildGenerationDataPrefix(
      keyPrefix,
      generationId,
    );

    const deleteMutations: Deno.KvKey[] = [];
    const insertMutations: Array<{ key: Deno.KvKey; value: unknown }> = [];

    for (const storedQuad of this.deleteBuffer) {
      const quadId = await hashQuad(storedQuad);
      const { primaryKey, indexKeys } = materializeQuadKeys({
        scopedDataPrefix,
        enabledIndexes,
        storedQuad,
        quadId,
      });

      deleteMutations.push(primaryKey, ...indexKeys);
    }

    for (const storedQuad of this.insertBuffer) {
      const quadId = await hashQuad(storedQuad);
      const { primaryKey, indexKeys, serializedQuad } = materializeQuadKeys({
        scopedDataPrefix,
        enabledIndexes,
        storedQuad,
        quadId,
      });

      insertMutations.push({ key: primaryKey, value: serializedQuad });
      for (const indexKey of indexKeys) {
        insertMutations.push({ key: indexKey, value: quadId });
      }
    }

    await commitBatchedKvMutations(this.options.kv, (batch) => {
      for (const key of deleteMutations) {
        batch.delete(key);
      }
      for (const { key, value } of insertMutations) {
        batch.set(key, value);
      }
    });

    this.insertBuffer = [];
    this.deleteBuffer = [];
  }
}
