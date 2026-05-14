import { Store } from "n3";
import { QueryEngine } from "@comunica/query-sparql-rdfjs-lite";
import type { ClientOptions } from "#/client/client.ts";
import { ComunicaSparqlEngine } from "#/client/providers/comunica/comunica-sparql-engine.ts";
import { DenokvSearchIndex } from "./denokv-search-index.ts";
import {
  DenokvQuadStore,
  type DenokvQuadStoreOptions,
} from "./denokv-quad-store.ts";

const queryEngine = new QueryEngine();

/**
 * DenokvOptions specifies configuration parameters for provisioning Denokv contexts.
 */
export interface DenokvOptions extends DenokvQuadStoreOptions {}

/**
 * provideDenoKv synthesizes a client gateway context designed explicitly for
 * stateless, per-operation execution. It leverages a lazy, transient hydration
 * pipeline that fetches fresh durable quads on-demand, providing strong data
 * consistency without requiring long-lived memory store residency.
 *
 * @param options Aggregated Deno Kv configurations and key namespace overrides.
 * @returns Composable ClientOptions ready for direct ingestion by the universal Client.
 */
export function provideDenoKv(options: DenokvOptions): ClientOptions {
  const quadStore = new DenokvQuadStore(options);

  /**
   * hydrateWorkspace fetches the absolute latest dataset state from Deno Kv
   * and materializes it inside an ephemeral, fast in-memory N3 workspace.
   */
  const hydrateWorkspace = async (): Promise<Store> => {
    const store = new Store();
    const dump = await quadStore.export({ format: { kind: "quads" } });
    if (dump.kind === "quads") {
      for (const q of dump.quads) {
        store.add(q);
      }
    }
    return store;
  };

  return {
    quadStore,

    searchIndex: new DenokvSearchIndex(options),

    sparqlEngine: {
      execute: async (request) => {
        const workspace = await hydrateWorkspace();
        const engine = new ComunicaSparqlEngine({
          queryEngine,
          store: workspace,
        });
        return await engine.execute(request);
      },
    },
  };
}
