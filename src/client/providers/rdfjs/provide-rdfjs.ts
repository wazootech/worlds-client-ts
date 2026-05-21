import { Store } from "n3";
import type { ClientOptions } from "@worlds/client";
import type { SparqlEngineInterface } from "@worlds/client";
import { RdfjsQuadStore } from "./rdfjs-quad-store.ts";
import { RdfjsSearchIndex } from "./rdfjs-search-index.ts";

/**
 * ProvideRdfjsSparqlEngineOptions supplies the per-provider N3 Store for SPARQL engine construction.
 */
export interface ProvideRdfjsSparqlEngineOptions {
  store: Store;
}

/**
 * ProvideRdfjsOptions specifies optional configuration for provisioning an in-memory RDFJS client context.
 */
export interface ProvideRdfjsOptions {
  /**
   * store is an optional pre-initialized N3 Store. When omitted, a fresh Store is created.
   */
  store?: Store;

  /**
   * createSparqlEngine optionally attaches a caller-provided SPARQL engine over the provider-managed store.
   */
  createSparqlEngine?: (
    options: ProvideRdfjsSparqlEngineOptions,
  ) => SparqlEngineInterface;
}

/**
 * provideRdfjs synthesizes a lightweight, in-memory client gateway context backed entirely by
 * local RDFJS primitives. It is the fastest path to a working Client for development, tests,
 * and single-process demos where no external persistence is needed.
 *
 * Unlike provideLibsql and provideDenoKv, there is no synchronization layer — all data exists
 * transiently in the N3 Store and is lost when the process exits.
 */
export function provideRdfjs(options?: ProvideRdfjsOptions): ClientOptions {
  const store = options?.store ?? new Store();

  return {
    quadStore: new RdfjsQuadStore(store),
    searchIndex: new RdfjsSearchIndex(store),
    sparqlEngine: options?.createSparqlEngine?.({ store }),
  };
}
