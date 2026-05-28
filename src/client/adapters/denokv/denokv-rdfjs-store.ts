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

const { quad, namedNode } = DataFactory;

/** MAX_KV_BATCH_SIZE caps atomic transaction size during commits. */
const MAX_KV_BATCH_SIZE = 50;

/**
 * DenokvRdfjsStore is an RDF/JS Store implementation backed by Deno KV.
 * It supports Comunica SPARQL by implementing `match` and buffering mutations until commit().
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
          // kv.list is async-iterable; we exhaust it in one read() call.
          for await (
            const entry of this.options.kv.list<SerializedQuad>({
              prefix: keyPrefix,
            })
          ) {
            const storedQuad = deserializeQuad(entry.value);
            if (matchesPattern(storedQuad, pattern)) {
              rowStream.push(storedQuad);
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
    for (const quad of quads) {
      this.insertBuffer.push(quad);
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
    for (const quad of quads) {
      this.deleteBuffer.push(quad);
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
   * commit persists buffered insertions and deletions to Deno KV.
   */
  public async commit(): Promise<void> {
    if (this.insertBuffer.length === 0 && this.deleteBuffer.length === 0) {
      return;
    }

    const keyPrefix = this.options.keyPrefix ?? ["quads"];
    let atomic = this.options.kv.atomic();
    let count = 0;

    for (const q of this.deleteBuffer) {
      const hash = await hashQuad(q);
      atomic.delete([...keyPrefix, hash]);
      count++;
      if (count >= MAX_KV_BATCH_SIZE) {
        await atomic.commit();
        atomic = this.options.kv.atomic();
        count = 0;
      }
    }

    for (const q of this.insertBuffer) {
      const hash = await hashQuad(q);
      atomic.set([...keyPrefix, hash], serializeQuad(q));
      count++;
      if (count >= MAX_KV_BATCH_SIZE) {
        await atomic.commit();
        atomic = this.options.kv.atomic();
        count = 0;
      }
    }

    if (count > 0) {
      await atomic.commit();
    }

    this.insertBuffer = [];
    this.deleteBuffer = [];
  }
}

function deserializeQuad(serializedQuad: SerializedQuad): rdfjs.Quad {
  return quad(
    deserializeTerm(serializedQuad.subject) as rdfjs.Quad_Subject,
    deserializeTerm(serializedQuad.predicate) as rdfjs.Quad_Predicate,
    deserializeTerm(serializedQuad.object) as rdfjs.Quad_Object,
    deserializeTerm(serializedQuad.graph) as rdfjs.Quad_Graph,
  );
}

function serializeQuad(storedQuad: rdfjs.Quad): SerializedQuad {
  return {
    subject: serializeTerm(storedQuad.subject),
    predicate: serializeTerm(storedQuad.predicate),
    object: serializeTerm(storedQuad.object),
    graph: serializeTerm(storedQuad.graph),
  };
}

function serializeTerm(term: rdfjs.Term): SerializedQuad["subject"] {
  return {
    termType: term.termType,
    value: term.value,
    language: term.termType === "Literal"
      ? (term as rdfjs.Literal).language
      : undefined,
    datatype: term.termType === "Literal"
      ? (term as rdfjs.Literal).datatype.value
      : undefined,
  };
}

function matchesPattern(
  candidate: rdfjs.Quad,
  pattern: {
    subject: rdfjs.Term | null;
    predicate: rdfjs.Term | null;
    object: rdfjs.Term | null;
    graph: rdfjs.Term | null;
  },
): boolean {
  if (pattern.subject && !candidate.subject.equals(pattern.subject)) {
    return false;
  }
  if (pattern.predicate && !candidate.predicate.equals(pattern.predicate)) {
    return false;
  }
  if (pattern.object && !candidate.object.equals(pattern.object)) return false;
  if (pattern.graph && !candidate.graph.equals(pattern.graph)) return false;
  return true;
}
