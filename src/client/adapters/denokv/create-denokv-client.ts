import { Client } from "@/client/client.ts";
import type { ClientInterface } from "@/client/client.ts";
import type { ComunicaQueryEngine } from "@/client/adapters/comunica/mod.ts";
import { ComunicaSparqlEngine } from "@/client/adapters/comunica/mod.ts";

import { DenokvQuadStore } from "./quad-store/mod.ts";
import { DenokvRdfjsStore } from "./rdfjs-store/mod.ts";
import { DenokvSearchIndex } from "./search-index/mod.ts";
import {
  createDenokvCommitSync,
  type DenokvCommitSyncOptions,
} from "./rdfjs-store/sync/denokv-commit-sync.ts";

/**
 * DenokvClientOptions specifies configuration parameters for Deno KV client contexts.
 */
export interface DenokvClientOptions extends DenokvCommitSyncOptions {
  /** queryEngine optionally enables built-in Comunica SPARQL over DenokvRdfjsStore. */
  queryEngine?: ComunicaQueryEngine;
}

/**
 * createDenokvClient synthesizes a Client over DenokvQuadStore and DenokvRdfjsStore.
 */
export function createDenokvClient(
  options: DenokvClientOptions,
): ClientInterface {
  const patchSync = createDenokvCommitSync(options);
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

  const sparqlEngine = options.queryEngine
    ? new ComunicaSparqlEngine({
      queryEngine: options.queryEngine,
      store: denokvRdfjsStore,
      onVoid: () => denokvRdfjsStore.commit(),
    })
    : undefined;

  return new Client({
    quadStore: denokvQuadStore,
    searchIndex: new DenokvSearchIndex({
      kv: options.kv,
      keyPrefix: options.keyPrefix,
    }),
    sparqlEngine,
  });
}
