import type * as rdfjs from "@rdfjs/types";

import { DenokvQuadStore } from "./denokv-quad-store.ts";
import { DenokvRdfjsStore } from "./denokv-rdfjs-store.ts";
import {
  createDenokvPatchSyncState,
  type DenokvPatchSyncAdapterOptions,
} from "./sync/denokv-patch-sync.ts";
import type { PatchSyncState } from "@/client/quad-store/mod.ts";

/**
 * DenokvStoresForTest bundles Deno KV quad and RDF/JS store facades for adapter tests.
 */
export interface DenokvStoresForTest {
  /** denokvQuadStore serves Client import and export in tests. */
  denokvQuadStore: DenokvQuadStore;

  /** denokvRdfjsStore serves Comunica SPARQL match and buffered updates in tests. */
  denokvRdfjsStore: DenokvRdfjsStore;

  /** patchSync coordinates persistPatch and deferred import lifecycle hooks in tests. */
  patchSync: PatchSyncState;
}

/**
 * createDenokvStoresForTest wires shared DenokvRdfjsStore and DenokvQuadStore instances for tests.
 */
export function createDenokvStoresForTest(
  options: DenokvPatchSyncAdapterOptions,
): DenokvStoresForTest {
  const patchSync = createDenokvPatchSyncState(options);
  const denokvRdfjsStore = new DenokvRdfjsStore({
    kv: options.kv,
    keyPrefix: options.keyPrefix,
    enabledHexastoreIndexes: options.enabledHexastoreIndexes,
    commitHandler: patchSync.commit,
  });
  const denokvQuadStore = new DenokvQuadStore({
    denokvRdfjsStore,
    importLifecycle: patchSync,
  });

  return { denokvQuadStore, denokvRdfjsStore, patchSync };
}

/**
 * seedDenokvQuadsForTest persists quads into an in-memory Deno Kv instance for adapter tests.
 */
export async function seedDenokvQuadsForTest(
  kv: Deno.Kv,
  quads: rdfjs.Quad[],
  options?: Pick<
    DenokvPatchSyncAdapterOptions,
    "keyPrefix" | "enabledHexastoreIndexes"
  >,
): Promise<void> {
  const { denokvQuadStore } = createDenokvStoresForTest({ kv, ...options });
  await denokvQuadStore.import({
    mode: "merge",
    source: { kind: "quads", quads },
  });
}
