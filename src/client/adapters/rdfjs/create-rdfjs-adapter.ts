import { Store } from "n3";
import type { Adapter } from "@/client/client.ts";
import type { ComunicaQueryEngine } from "@/client/adapters/comunica/mod.ts";
import { ComunicaSparqlEngine } from "@/client/adapters/comunica/mod.ts";
import { RdfjsQuadStore } from "./rdfjs-quad-store.ts";
import { RdfjsSearchIndex } from "./rdfjs-search-index.ts";

/**
 * RdfjsOptions specifies optional configuration for an in-memory RDFJS client context.
 */
export interface RdfjsOptions {
  /**
   * store is an optional pre-initialized N3 Store. When omitted, a fresh Store is created.
   */
  store?: Store;

  /** queryEngine optionally enables built-in Comunica SPARQL over the adapter-managed store. */
  queryEngine?: ComunicaQueryEngine;
}

/**
 * createRdfjsAdapter synthesizes a lightweight, in-memory client adapter backed entirely by
 * local RDFJS primitives. It is the fastest path to a working Client for development, tests,
 * and single-process demos where no external persistence is needed.
 *
 * Unlike createLibsqlAdapter and createDenokvAdapter, there is no synchronization layer — all data exists
 * transiently in the N3 Store and is lost when the process exits.
 */
export function createRdfjsAdapter(
  options?: RdfjsOptions,
): Adapter {
  const store = options?.store ?? new Store();

  return {
    quadStore: new RdfjsQuadStore(store),
    searchIndex: new RdfjsSearchIndex(store),
    sparqlEngine: options?.queryEngine
      ? new ComunicaSparqlEngine({ queryEngine: options.queryEngine, store })
      : undefined,
  };
}
