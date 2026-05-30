import type { ClientInterface } from "@/client/client.ts";
import type { ComunicaQueryEngine } from "@/client/adapters/comunica/mod.ts";
import { createComunicaEngineWithBufferedCommit } from "@/client/adapters/comunica/mod.ts";

import { createDenokvClientFromStores } from "./create-denokv-client-from-stores.ts";
import { DenokvQuadStore } from "./denokv-quad-store.ts";
import { DenokvRdfjsStore } from "./denokv-rdfjs-store.ts";
import { DenokvSearchIndex } from "./denokv-search-index.ts";
import type { PatchSyncState } from "@/client/quad-store/mod.ts";
import {
  createDenokvPatchSyncState,
  type DenokvPatchSyncAdapterOptions,
} from "./sync/denokv-patch-sync.ts";

/**
 * DenokvClientOptions specifies configuration parameters for Deno KV client contexts.
 */
export interface DenokvClientOptions extends DenokvPatchSyncAdapterOptions {
  /** queryEngine optionally enables built-in Comunica SPARQL over DenokvRdfjsStore. */
  queryEngine?: ComunicaQueryEngine;
}

/**
 * DenokvStores bundles shared Deno KV quad and RDF/JS store facades.
 */
export interface DenokvStores {
  /** denokvQuadStore serves Client import and export. */
  denokvQuadStore: DenokvQuadStore;

  /** denokvRdfjsStore serves Comunica SPARQL match and buffered updates. */
  denokvRdfjsStore: DenokvRdfjsStore;

  /** patchSync coordinates persistPatch and deferred import lifecycle hooks. */
  patchSync: PatchSyncState;
}

/**
 * createDenokvStores wires shared DenokvRdfjsStore and DenokvQuadStore instances.
 */
export function createDenokvStores(
  options: DenokvPatchSyncAdapterOptions,
): DenokvStores {
  const patchSync = createDenokvPatchSyncState(options);
  const denokvRdfjsStore = new DenokvRdfjsStore({
    kv: options.kv,
    keyPrefix: options.keyPrefix,
    enabledHexastoreIndexes: options.enabledHexastoreIndexes,
    commitHandler: patchSync.persistPatch,
  });
  const denokvQuadStore = new DenokvQuadStore({
    denokvRdfjsStore,
    importLifecycle: patchSync,
  });

  return { denokvQuadStore, denokvRdfjsStore, patchSync };
}

/**
 * createDenokvClient synthesizes a Client over DenokvQuadStore and DenokvRdfjsStore.
 */
export function createDenokvClient(
  options: DenokvClientOptions,
): ClientInterface {
  const { denokvQuadStore, denokvRdfjsStore } = createDenokvStores(options);

  return createDenokvClientFromStores({
    denokvQuadStore,
    denokvRdfjsStore,
    searchIndex: new DenokvSearchIndex({
      kv: options.kv,
      keyPrefix: options.keyPrefix,
    }),
    createSparqlEngine: options.queryEngine
      ? ({ store }) =>
        createComunicaEngineWithBufferedCommit({
          queryEngine: options.queryEngine!,
          store,
        })
      : undefined,
  });
}
