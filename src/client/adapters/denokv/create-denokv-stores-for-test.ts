import type * as rdfjs from "@rdfjs/types";

import { DenokvQuadStore } from "./quad-store/mod.ts";
import { DenokvRdfjsStore } from "./rdfjs-store/mod.ts";
import {
  createDenokvPersistHooks,
  type DenokvPersistHooksOptions,
} from "./rdfjs-store/sync/create-denokv-persist-hooks.ts";
import { resolveImportLifecycle } from "@/client/import-lifecycle/mod.ts";

/**
 * DenokvStoresForTest bundles Deno KV quad and RDF/JS store facades for adapter tests.
 */
export interface DenokvStoresForTest {
  /** denokvQuadStore serves Client import and export in tests. */
  denokvQuadStore: DenokvQuadStore;

  /** denokvRdfjsStore serves Comunica SPARQL match and buffered updates in tests. */
  denokvRdfjsStore: DenokvRdfjsStore;
}

/**
 * createDenokvStoresForTest wires shared DenokvRdfjsStore and DenokvQuadStore instances for tests.
 */
export function createDenokvStoresForTest(
  options: DenokvPersistHooksOptions,
): DenokvStoresForTest {
  const persistHooks = createDenokvPersistHooks(options);
  const importLifecycle = resolveImportLifecycle({
    beforeImport: persistHooks.beforeImport,
    afterImport: persistHooks.afterImport,
  });
  const denokvRdfjsStore = new DenokvRdfjsStore({
    kv: options.kv,
    keyPrefix: options.keyPrefix,
    enabledHexastoreIndexes: options.enabledHexastoreIndexes,
  });
  const denokvQuadStore = new DenokvQuadStore({
    denokvRdfjsStore,
    commitHandler: persistHooks.commitHandler,
    importLifecycle,
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
    "keyPrefix" | "enabledHexastoreIndexes"
  >,
): Promise<void> {
  const { denokvQuadStore } = createDenokvStoresForTest({ kv, ...options });
  await denokvQuadStore.import({
    mode: "merge",
    source: { kind: "quads", quads },
  });
}
