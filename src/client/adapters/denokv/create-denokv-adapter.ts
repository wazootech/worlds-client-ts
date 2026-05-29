import type { Adapter } from "@/client/client.ts";
import type { ComunicaQueryEngine } from "@/client/adapters/comunica/mod.ts";
import { ComunicaSparqlEngine } from "@/client/adapters/comunica/mod.ts";
import { DenokvSearchIndex } from "./denokv-search-index.ts";
import type { DenokvQuadStoreOptions } from "./denokv-quad-store.ts";
import { DenokvQuadStore } from "./denokv-quad-store.ts";
import { DenokvRdfjsStore } from "./denokv-rdfjs-store.ts";

/**
 * DenokvOptions specifies configuration parameters for Deno Kv adapter contexts.
 */
export interface DenokvOptions extends DenokvQuadStoreOptions {
  /** queryEngine optionally enables built-in Comunica SPARQL over the hydrated workspace store. */
  queryEngine?: ComunicaQueryEngine;
}

/**
 * createDenokvAdapter synthesizes a client adapter designed explicitly for
 * stateless, per-operation execution. It leverages a lazy, transient hydration
 * pipeline that fetches fresh durable quads on-demand, providing strong data
 * consistency without requiring long-lived memory store residency.
 */
export function createDenokvAdapter(
  options: DenokvOptions,
): Adapter {
  const quadStore = new DenokvQuadStore(options);
  const rdfjsStore = new DenokvRdfjsStore(options);

  return {
    quadStore,

    searchIndex: new DenokvSearchIndex(options),

    sparqlEngine: options.queryEngine
      ? {
        execute: async (request) => {
          const engine = new ComunicaSparqlEngine({
            queryEngine: options.queryEngine!,
            store: rdfjsStore,
            onVoid: () => rdfjsStore.commit(),
          });
          const response = await engine.execute(request);
          await rdfjsStore.commit();
          return response;
        },
      }
      : undefined,
  };
}
