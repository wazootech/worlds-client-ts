import { Client } from "@/client/client.ts";
import type { ClientInterface } from "@/client/client.ts";
import type { SparqlEngineInterface } from "@/client/sparql-engine/mod.ts";
import type { SearchIndexInterface } from "@/client/search-index/mod.ts";
import type { DenokvQuadStore } from "./denokv-quad-store.ts";
import type { DenokvRdfjsStore } from "./denokv-rdfjs-store.ts";

/**
 * DenokvClientFromStoresOptions configures Deno KV client assembly over suffixed store facades.
 */
export interface DenokvClientFromStoresOptions {
  /** denokvQuadStore serves Client import and export. */
  denokvQuadStore: DenokvQuadStore;

  /** denokvRdfjsStore serves Comunica SPARQL match and buffered updates. */
  denokvRdfjsStore: DenokvRdfjsStore;

  /** searchIndex projects keyword discovery over Deno KV chunk keys. */
  searchIndex: SearchIndexInterface;

  /** createSparqlEngine optionally attaches a caller-provided SPARQL engine over denokvRdfjsStore. */
  createSparqlEngine?: (
    options: { store: DenokvRdfjsStore },
  ) => SparqlEngineInterface;
}

/**
 * createDenokvClientFromStores assembles a Client over Deno KV stores.
 */
export function createDenokvClientFromStores(
  options: DenokvClientFromStoresOptions,
): ClientInterface {
  const sparqlEngine = options.createSparqlEngine?.({
    store: options.denokvRdfjsStore,
  });

  return new Client({
    quadStore: options.denokvQuadStore,
    searchIndex: options.searchIndex,
    sparqlEngine,
  });
}
