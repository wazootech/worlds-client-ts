import { Store } from "n3";
import { Client } from "@/client/client.ts";
import type {
  SparqlEngineInterface,
  SparqlRequest,
} from "@/client/sparql-engine/mod.ts";
import { DenokvSearchIndex } from "./denokv-search-index.ts";
import type { DenokvQuadStoreOptions } from "./denokv-quad-store.ts";
import { DenokvQuadStore } from "./denokv-quad-store.ts";

/**
 * DenokvOptions specifies configuration parameters for Deno Kv adapter contexts.
 */
export interface DenokvOptions extends DenokvQuadStoreOptions {
  /** createSparqlEngine optionally attaches a caller-provided SPARQL engine over each hydrated workspace. */
  createSparqlEngine?: (
    options: { store: Store },
  ) => SparqlEngineInterface;
}

/**
 * createDenokvClient synthesizes a Client designed explicitly for stateless,
 * per-operation execution. It leverages a lazy, transient hydration pipeline that
 * fetches fresh durable quads on-demand, providing strong data consistency without
 * requiring long-lived memory store residency.
 */
export function createDenokvClient(
  options: DenokvOptions,
): Client {
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

  const sparqlEngine = options.createSparqlEngine
    ? {
      sparql: async (request: SparqlRequest) => {
        const workspace = await hydrateWorkspace();
        const engine = options.createSparqlEngine?.({ store: workspace });
        if (!engine) {
          throw new Error("SPARQL engine is not configured.");
        }
        return await engine.sparql(request);
      },
    }
    : undefined;

  return new Client(quadStore, new DenokvSearchIndex(options), sparqlEngine);
}

/**
 * createDenokvAdapter is deprecated; use createDenokvClient. Removed in 0.0.17.
 */
export const createDenokvAdapter = createDenokvClient;
