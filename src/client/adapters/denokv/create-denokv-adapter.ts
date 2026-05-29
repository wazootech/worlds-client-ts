import type { ComunicaQueryEngine } from "@/client/adapters/comunica/mod.ts";
import { ComunicaSparqlEngine } from "@/client/adapters/comunica/mod.ts";
import type { Adapter } from "@/client/client.ts";
import { createDenokvAdapterFromStores } from "./create-denokv-adapter-from-stores.ts";
import type { DenokvQuadStoreOptions } from "./denokv-quad-store.ts";
import { DenokvQuadStore } from "./denokv-quad-store.ts";
import { DenokvRdfjsStore } from "./denokv-rdfjs-store.ts";
import { DenokvSearchIndex } from "./denokv-search-index.ts";

/**
 * DenokvOptions specifies configuration parameters for Deno Kv adapter contexts.
 */
export interface DenokvOptions extends DenokvQuadStoreOptions {
  /** queryEngine optionally enables built-in Comunica SPARQL over DenokvRdfjsStore. */
  queryEngine?: ComunicaQueryEngine;
}

/**
 * createDenokvAdapter synthesizes a client adapter over DenokvQuadStore and DenokvRdfjsStore.
 */
export function createDenokvAdapter(
  options: DenokvOptions,
): Adapter {
  const denokvQuadStore = new DenokvQuadStore(options);
  const denokvRdfjsStore = new DenokvRdfjsStore(options);

  return createDenokvAdapterFromStores({
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
