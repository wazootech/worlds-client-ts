import { Client } from "@/client/client.ts";
import type { ClientInterface } from "@/client/client.ts";
import type { ComunicaQueryEngine } from "@/client/adapters/comunica/mod.ts";
import { ComunicaSparqlEngine } from "@/client/adapters/comunica/mod.ts";

import { DenokvQuadStore } from "./quad-store/mod.ts";
import { DenokvRdfjsStore } from "./rdfjs-store/mod.ts";
import { DenokvSearchIndex } from "./search-index/mod.ts";
import {
  createDenokvPersistHooks,
  type DenokvPersistHooksOptions,
} from "./rdfjs-store/sync/create-denokv-persist-hooks.ts";
import { resolveImportLifecycle } from "@/client/import-lifecycle/mod.ts";

/**
 * DenokvClientOptions specifies configuration parameters for Deno KV client contexts.
 */
export interface DenokvClientOptions extends DenokvPersistHooksOptions {
  /** queryEngine optionally enables built-in Comunica SPARQL over DenokvRdfjsStore. */
  queryEngine?: ComunicaQueryEngine;
}

/**
 * createDenokvClient synthesizes a Client over DenokvQuadStore and DenokvRdfjsStore.
 */
export function createDenokvClient(
  options: DenokvClientOptions,
): ClientInterface {
  const persistHooks = createDenokvPersistHooks(options);
  const importLifecycle = resolveImportLifecycle({
    beforeImport: persistHooks.beforeImport,
    afterImport: persistHooks.afterImport,
  });
  const denokvRdfjsStore = new DenokvRdfjsStore({
    kv: options.kv,
    keyPrefix: options.keyPrefix,
    enabledHexastoreIndexes: options.enabledHexastoreIndexes,
    commitHandler: persistHooks.commitHandler,
    importLifecycle,
  });
  const denokvQuadStore = new DenokvQuadStore({
    denokvRdfjsStore,
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
