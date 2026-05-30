import type * as rdfjs from "@rdfjs/types";
import type { SparqlEngineInterface } from "@/client/sparql-engine/mod.ts";
import {
  type ComunicaQueryEngine,
  ComunicaSparqlEngine,
} from "./comunica-sparql-engine.ts";

/**
 * BufferedCommitStore exposes commit() for flushing SPARQL UPDATE buffers.
 */
export interface BufferedCommitStore {
  /** commit persists buffered store mutations. */
  commit(): Promise<void>;
}

/**
 * CreateComunicaEngineWithBufferedCommitOptions configures Comunica SPARQL over a buffered store.
 */
export interface CreateComunicaEngineWithBufferedCommitOptions {
  /** queryEngine is the caller-provided Comunica-compatible query engine. */
  queryEngine: ComunicaQueryEngine;

  /** store is the RDF/JS store backing SPARQL match and buffered updates. */
  store: rdfjs.Store & BufferedCommitStore;

  /** onVoid optionally overrides the post-UPDATE commit callback. */
  onVoid?: () => Promise<void>;
}

/**
 * wrapSparqlEngineWithBufferedCommit flushes store.commit() after every SPARQL execute call.
 */
export function wrapSparqlEngineWithBufferedCommit(
  sparqlEngine: SparqlEngineInterface,
  store: BufferedCommitStore,
): SparqlEngineInterface {
  return {
    execute: async (request) => {
      const response = await sparqlEngine.execute(request);
      await store.commit();
      return response;
    },
  };
}

/**
 * createComunicaEngineWithBufferedCommit builds Comunica SPARQL with post-query buffer commits.
 */
export function createComunicaEngineWithBufferedCommit(
  options: CreateComunicaEngineWithBufferedCommitOptions,
): SparqlEngineInterface {
  const comunicaEngine = new ComunicaSparqlEngine({
    queryEngine: options.queryEngine,
    store: options.store,
    onVoid: options.onVoid ?? (() => options.store.commit()),
  });

  return wrapSparqlEngineWithBufferedCommit(comunicaEngine, options.store);
}
