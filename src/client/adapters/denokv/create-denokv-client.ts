import { Client } from "@/client/client.ts";
import type { ClientInterface } from "@/client/client.ts";
import type { ComunicaQueryEngine } from "@/client/adapters/comunica/mod.ts";
import { createComunicaEngineWithBufferedCommit } from "@/client/adapters/comunica/mod.ts";

import { DenokvQuadStore } from "./denokv-quad-store.ts";
import { DenokvRdfjsStore } from "./denokv-rdfjs-store.ts";
import { DenokvSearchIndex } from "./denokv-search-index.ts";
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
 * createDenokvClient synthesizes a Client over DenokvQuadStore and DenokvRdfjsStore.
 */
export function createDenokvClient(
  options: DenokvClientOptions,
): ClientInterface {
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

  const sparqlEngine = options.queryEngine
    ? createComunicaEngineWithBufferedCommit({
      queryEngine: options.queryEngine,
      store: denokvRdfjsStore,
    })
    : undefined;

  return new Client({
    quadStore: denokvQuadStore,
    sparqlEngine,
    searchIndex: new DenokvSearchIndex({
      kv: options.kv,
      keyPrefix: options.keyPrefix,
    }),
  });
}
