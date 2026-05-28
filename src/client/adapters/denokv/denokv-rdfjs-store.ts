import type * as rdfjs from "@rdfjs/types";
import { DataFactory } from "n3";
import { Readable } from "node:stream";
import { EventEmitter } from "node:events";

import type {
  DenokvQuadStoreOptions,
  SerializedQuad,
} from "./denokv-quad-store.ts";
import { deserializeTerm } from "./denokv-quad-store.ts";
import { hashQuad } from "@/client/quad-store/mod.ts";
import {
  buildGenerationDataPrefix,
  buildPrimaryQuadKey,
} from "./denokv-hexastore-keys.ts";
import {
  DEFAULT_DENOKV_HEXASTORE_INDEXES,
} from "./denokv-hexastore-index-set.ts";
import { readActiveGeneration } from "./denokv-dataset-generation.ts";
import { materializeQuadKeys } from "./denokv-quad-keys.ts";
import {
  buildBestMatchCursor,
  matchesPattern,
} from "./denokv-match-selector.ts";

const { quad, namedNode } = DataFactory;

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

    const rowStream = new Readable({
      objectMode: true,
      read: async () => {
        try {
          const generationId = await readActiveGeneration(
            this.options.kv,
            keyPrefix,
          );
          const scopedDataPrefix = buildGenerationDataPrefix(
            keyPrefix,
            generationId,
          );
          const cursor = buildBestMatchCursor(
            scopedDataPrefix,
            enabledIndexes,
            pattern,
          );

          if (cursor.kind === "index") {
            for await (
              const entry of this.options.kv.list<string>(cursor.selector)
            ) {
              const quadId = entry.value;
              const quadEntry = await this.options.kv.get<SerializedQuad>(
                buildPrimaryQuadKey(scopedDataPrefix, quadId),
              );

              if (!quadEntry.value) continue;

              const storedQuad = deserializeQuad(quadEntry.value);
              if (matchesPattern(storedQuad, pattern)) {
                rowStream.push(storedQuad);
              }
            }
          } else {
            for await (
              const entry of this.options.kv.list<SerializedQuad>(
                cursor.selector,
              )
            ) {
              if (!entry.value) continue;
              const storedQuad = deserializeQuad(entry.value);
              if (matchesPattern(storedQuad, pattern)) {
                rowStream.push(storedQuad);
              }
            }
          }

          rowStream.push(null);
        } catch (error) {
          rowStream.destroy(error as Error);
        }
      },
    });

    return rowStream as unknown as rdfjs.Stream<rdfjs.Quad>;
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

    let atomic = this.options.kv.atomic();
    let mutationCount = 0;

    for (const storedQuad of this.deleteBuffer) {
      const quadId = await hashQuad(storedQuad);
      const { primaryKey, indexKeys } = materializeQuadKeys({
        scopedDataPrefix,
        enabledIndexes,
        storedQuad,
        quadId,
      });

      atomic.delete(primaryKey);
      for (const indexKey of indexKeys) {
        atomic.delete(indexKey);
      }

      mutationCount += 1 + indexKeys.length;
      if (mutationCount >= MAX_ATOMIC_MUTATIONS) {
        await atomic.commit();
        atomic = this.options.kv.atomic();
        mutationCount = 0;
      }
    }

    for (const storedQuad of this.insertBuffer) {
      const quadId = await hashQuad(storedQuad);
      const { primaryKey, indexKeys, serializedQuad } = materializeQuadKeys({
        scopedDataPrefix,
        enabledIndexes,
        storedQuad,
        quadId,
      });

      atomic.set(primaryKey, serializedQuad);
      for (const indexKey of indexKeys) {
        atomic.set(indexKey, quadId);
      }

      mutationCount += 1 + indexKeys.length;
      if (mutationCount >= MAX_ATOMIC_MUTATIONS) {
        await atomic.commit();
        atomic = this.options.kv.atomic();
        mutationCount = 0;
      }
    }

    if (mutationCount > 0) {
      await atomic.commit();
    }

    this.insertBuffer = [];
    this.deleteBuffer = [];
  }
}

const MAX_ATOMIC_MUTATIONS = 200;

function deserializeQuad(serializedQuad: SerializedQuad): rdfjs.Quad {
  return quad(
    deserializeTerm(serializedQuad.subject) as rdfjs.Quad_Subject,
    deserializeTerm(serializedQuad.predicate) as rdfjs.Quad_Predicate,
    deserializeTerm(serializedQuad.object) as rdfjs.Quad_Object,
    deserializeTerm(serializedQuad.graph) as rdfjs.Quad_Graph,
  );
}
