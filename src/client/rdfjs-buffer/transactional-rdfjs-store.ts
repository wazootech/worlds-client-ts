import type * as rdfjs from "@rdfjs/types";
import type { Transaction } from "./transaction.ts";
import type { RdfjsExportSource } from "./import-export-via-rdfjs-store.ts";
import type { EventEmitter } from "node:events";

/**
 * TransactionalRdfjsStore combines a read-only stream source (match) with a Transaction
 * to produce a mutable rdfjs.Store. It implements the surface required by Comunica
 * SPARQL engines for executing UPDATE queries.
 */
export function createTransactionalRdfjsStore(
  readSource: RdfjsExportSource,
  transaction: Transaction,
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
      transaction.add(quad);
      return this;
    },

    addQuad(quad: rdfjs.Quad) {
      transaction.addQuad(quad);
      return this;
    },

    delete(quad: rdfjs.Quad) {
      transaction.delete(quad);
      return this;
    },

    removeQuad(quad: rdfjs.Quad) {
      transaction.removeQuad(quad);
      return this;
    },

    addQuads(quads: rdfjs.Quad[]) {
      transaction.addQuads(quads);
      return this;
    },

    removeQuads(quads: rdfjs.Quad[]) {
      transaction.removeQuads(quads);
      return this;
    },

    import(stream: rdfjs.Stream<rdfjs.Quad>): EventEmitter {
      return transaction.import(stream);
    },

    remove(stream: rdfjs.Stream<rdfjs.Quad>): EventEmitter {
      return transaction.remove(stream);
    },

    removeMatches(
      subject?: rdfjs.Term | null,
      predicate?: rdfjs.Term | null,
      object?: rdfjs.Term | null,
      graph?: rdfjs.Term | null,
    ): EventEmitter {
      return transaction.removeMatches(
        readSource.match.bind(readSource),
        subject,
        predicate,
        object,
        graph,
      );
    },

    deleteGraph(graph: rdfjs.Term | string): EventEmitter {
      return transaction.deleteGraph(readSource.match.bind(readSource), graph);
    },
  } as unknown as rdfjs.Store;
}
