import type * as rdfjs from "@rdfjs/types";

import { RdfjsQuadStore } from "@/client/adapters/rdfjs/rdfjs-quad-store.ts";

import { DenokvRdfjsStore } from "./rdfjs-store/mod.ts";
import {
  createDenokvPersistHooks,
  type DenokvPersistHooksOptions,
} from "./create-denokv-persist-hooks.ts";
/**
 * DenokvStoresForTest bundles Deno KV quad and RDF/JS store facades for adapter tests.
 */
export interface DenokvStoresForTest {
  /** denokvQuadStore serves Client import and export in tests. */
  denokvQuadStore: RdfjsQuadStore;

  /** denokvRdfjsStore serves Comunica SPARQL match and buffered updates in tests. */
  denokvRdfjsStore: DenokvRdfjsStore;
}

/**
 * createDenokvStoresForTest wires shared DenokvRdfjsStore and BufferedRdfjsQuadStore instances for tests.
 */
export function createDenokvStoresForTest(
  options: DenokvPersistHooksOptions,
): DenokvStoresForTest {
  const persistHooks = createDenokvPersistHooks(options);
  const denokvRdfjsStore = new DenokvRdfjsStore({
    kv: options.kv,
    keyPrefix: options.keyPrefix,
    enabledQuadIndexes: options.enabledQuadIndexes,
  });
  const denokvQuadStore = new RdfjsQuadStore({
    store: denokvRdfjsStore as unknown as rdfjs.Store,
    commit: async (patch, context) => {
      await persistHooks.commit(patch, context);
    },
  });

  return { denokvQuadStore, denokvRdfjsStore };
}

/**
 * seedDenokvQuadsForTest persists quads into an in-memory Deno Kv instance for adapter tests.
 */
export async function seedDenokvQuadsForTest(
  kv: Deno.Kv,
  quads: rdfjs.Quad[],
  options?: Pick<
    DenokvPersistHooksOptions,
    "keyPrefix" | "enabledQuadIndexes"
  >,
): Promise<void> {
  const { denokvQuadStore } = createDenokvStoresForTest({ kv, ...options });
  await denokvQuadStore.import({
    mode: "merge",
    source: { kind: "quads", quads },
  });
}
