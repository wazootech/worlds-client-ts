import type { ComunicaQueryEngine } from "@/client/adapters/comunica/mod.ts";
import { ComunicaSparqlEngine } from "@/client/adapters/comunica/mod.ts";
import type { Client } from "@/client/client.ts";
import { createDenokvClientFromStores } from "./create-denokv-client-from-stores.ts";
import type { DenokvQuadStoreOptions } from "./denokv-quad-store.ts";
import { DenokvQuadStore } from "./denokv-quad-store.ts";
import { DenokvRdfjsStore } from "./denokv-rdfjs-store.ts";
import { DenokvSearchIndex } from "./denokv-search-index.ts";

/**
 * DenokvClientOptions specifies configuration parameters for Deno KV client contexts.
 */
export interface DenokvClientOptions extends DenokvQuadStoreOptions {
  /** queryEngine optionally enables built-in Comunica SPARQL over DenokvRdfjsStore. */
  queryEngine?: ComunicaQueryEngine;
}

/**
 * createDenokvClient synthesizes a Client over DenokvQuadStore and DenokvRdfjsStore.
 */
export function createDenokvClient(
  options: DenokvClientOptions,
): Client {
  const denokvQuadStore = new DenokvQuadStore(options);
  const denokvRdfjsStore = new DenokvRdfjsStore(options);

  return createDenokvClientFromStores({
    denokvQuadStore,
    denokvRdfjsStore,
    searchIndex: new DenokvSearchIndex(options),
    sparqlEngine: options.queryEngine
      ? {
        execute: async (request) => {
          const engine = new ComunicaSparqlEngine({
            queryEngine: options.queryEngine!,
            store: denokvRdfjsStore,
            onVoid: () => denokvRdfjsStore.commit(),
          });
          const response = await engine.execute(request);
          await denokvRdfjsStore.commit();
          return response;
        },
      }
      : undefined,
  });
}
