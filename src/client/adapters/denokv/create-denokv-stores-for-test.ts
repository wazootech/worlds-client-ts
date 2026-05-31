import type * as rdfjs from "@rdfjs/types";

import { DenokvQuadStore } from "./quad-store/mod.ts";
import { DenokvRdfjsStore } from "./rdfjs-store/mod.ts";
import {
  createDenokvCommitSync,
  type DenokvCommitSyncOptions,
} from "./rdfjs-store/sync/denokv-commit-sync.ts";
import type { CommitSyncState } from "@/client/commit-sync/mod.ts";

/**
 * DenokvStoresForTest bundles Deno KV quad and RDF/JS store facades for adapter tests.
 */
export interface DenokvStoresForTest {
  /** denokvQuadStore serves Client import and export in tests. */
  denokvQuadStore: DenokvQuadStore;

  /** denokvRdfjsStore serves Comunica SPARQL match and buffered updates in tests. */
  denokvRdfjsStore: DenokvRdfjsStore;

  /** commitSync coordinates commit and deferred import lifecycle hooks in tests. */
  commitSync: CommitSyncState;
}

/**
 * createDenokvStoresForTest wires shared DenokvRdfjsStore and DenokvQuadStore instances for tests.
 */
export function createDenokvStoresForTest(
  options: DenokvCommitSyncOptions,
): DenokvStoresForTest {
  const commitSync = createDenokvCommitSync(options);
  const denokvRdfjsStore = new DenokvRdfjsStore({
    kv: options.kv,
    keyPrefix: options.keyPrefix,
    enabledHexastoreIndexes: options.enabledHexastoreIndexes,
    commitHandler: commitSync.commit,
  });
  const denokvQuadStore = new DenokvQuadStore({
    denokvRdfjsStore,
    importLifecycle: commitSync,
  });

  return { denokvQuadStore, denokvRdfjsStore, commitSync };
}

/**
 * seedDenokvQuadsForTest persists quads into an in-memory Deno Kv instance for adapter tests.
 */
export async function seedDenokvQuadsForTest(
  kv: Deno.Kv,
  quads: rdfjs.Quad[],
  options?: Pick<
    DenokvCommitSyncOptions,
    "keyPrefix" | "enabledHexastoreIndexes"
  >,
): Promise<void> {
  const { denokvQuadStore } = createDenokvStoresForTest({ kv, ...options });
  await denokvQuadStore.import({
    mode: "merge",
    source: { kind: "quads", quads },
  });
}
