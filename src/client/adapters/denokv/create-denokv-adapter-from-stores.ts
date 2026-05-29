import type { Adapter } from "@/client/client.ts";
import type { SparqlEngineInterface } from "@/client/sparql-engine/mod.ts";
import type { SearchIndexInterface } from "@/client/search-index/mod.ts";
import type { DenokvQuadStore } from "./denokv-quad-store.ts";
import type { DenokvRdfjsStore } from "./denokv-rdfjs-store.ts";

/**
 * DenokvAdapterFromStoresOptions configures Deno KV adapter assembly over suffixed store facades.
 */
export interface DenokvAdapterFromStoresOptions {
  /** denokvQuadStore serves Client import and export. */
  denokvQuadStore: DenokvQuadStore;

  /** denokvRdfjsStore serves Comunica SPARQL match and buffered updates. */
  denokvRdfjsStore: DenokvRdfjsStore;

  /** searchIndex projects keyword discovery over Deno KV chunk keys. */
  searchIndex: SearchIndexInterface;

  /** sparqlEngine optionally evaluates SPARQL over denokvRdfjsStore. */
  sparqlEngine?: SparqlEngineInterface;
}

/**
 * createDenokvAdapterFromStores assembles Client-facing quad/SPARQL/search facades over Deno KV stores.
 */
export function createDenokvAdapterFromStores(
  options: DenokvAdapterFromStoresOptions,
): Adapter {
  return {
    quadStore: options.denokvQuadStore,
    searchIndex: options.searchIndex,
    sparqlEngine: options.sparqlEngine,
  };
}
