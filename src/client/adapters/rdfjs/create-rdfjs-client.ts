import { Store } from "n3";
import type { ClientOptions } from "@/client/client.ts";
import type { SparqlEngineInterface } from "@/client/sparql-engine/mod.ts";
import { RdfjsQuadStore } from "./rdfjs-quad-store.ts";
import { RdfjsSearchIndex } from "./rdfjs-search-index.ts";

/**
 * RdfjsSparqlEngineOptions supplies the per-adapter N3 Store for SPARQL engine construction.
 */
export interface RdfjsSparqlEngineOptions {
  store: Store;
}

/**
 * RdfjsOptions specifies optional configuration for an in-memory RDFJS client context.
 */
export interface RdfjsOptions {
  /**
   * store is an optional pre-initialized N3 Store. When omitted, a fresh Store is created.
   */
  store?: Store;

  /**
   * createSparqlEngine optionally attaches a caller-provided SPARQL engine over the adapter-managed store.
   */
  createSparqlEngine?: (
    options: RdfjsSparqlEngineOptions,
  ) => SparqlEngineInterface;
}

/**
 * createRdfjsClientOptions synthesizes a lightweight, in-memory client gateway context backed entirely by
 * local RDFJS primitives. It is the fastest path to a working Client for development, tests,
 * and single-process demos where no external persistence is needed.
 *
 * Unlike createLibsqlClientOptions and createDenokvClientOptions, there is no synchronization layer — all data exists
 * transiently in the N3 Store and is lost when the process exits.
 */
export function createRdfjsClientOptions(
  options?: RdfjsOptions,
): ClientOptions {
  const store = options?.store ?? new Store();

  return {
    quadStore: new RdfjsQuadStore(store),
    searchIndex: new RdfjsSearchIndex(store),
    sparqlEngine: options?.createSparqlEngine?.({ store }),
  };
}
