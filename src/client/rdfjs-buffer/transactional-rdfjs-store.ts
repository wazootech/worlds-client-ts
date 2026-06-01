import type * as rdfjs from "@rdfjs/types";
import { EventEmitter } from "node:events";
import type { QuadTransaction } from "./transaction.ts";
import type { RdfjsExportSource } from "./import-export-via-rdfjs-store.ts";

/**
 * TransactionalRdfjsStore combines a read-only stream source (match) with a QuadTransaction
 * to produce a mutable rdfjs.Store. It implements only the surface required by Comunica
 * SPARQL engines for executing UPDATE queries.
 */
export function createTransactionalRdfjsStore(
  readSource: RdfjsExportSource,
  transaction: QuadTransaction,
): rdfjs.Store {
  return {
    match(
      subject?: rdfjs.Term | null,
      predicate?: rdfjs.Term | null,
      object?: rdfjs.Term | null,
      graph?: rdfjs.Term | null,
    ): rdfjs.Stream<rdfjs.Quad> {
      return readSource.match(subject, predicate, object, graph);
    },

    add(quad: rdfjs.Quad) {
      transaction.addQuad(quad);
      return this;
    },

    addQuad(quad: rdfjs.Quad) {
      transaction.addQuad(quad);
      return this;
    },

    delete(quad: rdfjs.Quad) {
      transaction.removeQuad(quad);
      return this;
    },

    removeQuad(quad: rdfjs.Quad) {
      transaction.removeQuad(quad);
      return this;
    },

    // The following methods are part of rdfjs.Store but are not used by Comunica during SPARQL execution
    // or standard adapter imports. They are stubbed to satisfy the interface contract.
    addQuads(_quads: rdfjs.Quad[]) {
      throw new Error("addQuads is not supported on TransactionalRdfjsStore");
    },
    removeQuads(_quads: rdfjs.Quad[]) {
      throw new Error(
        "removeQuads is not supported on TransactionalRdfjsStore",
      );
    },
    import(stream: rdfjs.Stream<rdfjs.Quad>): EventEmitter {
      const emitter = new EventEmitter();
      stream.on("data", (quad: rdfjs.Quad) => {
        try {
          transaction.addQuad(quad);
        } catch (e) {
          emitter.emit("error", e);
        }
      });
      stream.on("end", () => {
        emitter.emit("end");
      });
      stream.on("error", (err) => {
        emitter.emit("error", err);
      });
      return emitter;
    },
    remove(stream: rdfjs.Stream<rdfjs.Quad>): EventEmitter {
      const emitter = new EventEmitter();
      stream.on("data", (quad: rdfjs.Quad) => {
        try {
          transaction.removeQuad(quad);
        } catch (e) {
          emitter.emit("error", e);
        }
      });
      stream.on("end", () => {
        emitter.emit("end");
      });
      stream.on("error", (err) => {
        emitter.emit("error", err);
      });
      return emitter;
    },
    removeMatches(
      _subject?: rdfjs.Term | null,
      _predicate?: rdfjs.Term | null,
      _object?: rdfjs.Term | null,
      _graph?: rdfjs.Term | null,
    ): EventEmitter {
      throw new Error(
        "removeMatches is not supported on TransactionalRdfjsStore",
      );
    },
    deleteGraph(_graph: rdfjs.Term | string): EventEmitter {
      throw new Error(
        "deleteGraph is not supported on TransactionalRdfjsStore",
      );
    },
  } as unknown as rdfjs.Store;
}
