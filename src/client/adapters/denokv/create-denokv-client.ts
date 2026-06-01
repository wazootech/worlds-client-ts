import { createAdapterClient } from "@/client/rdfjs-buffer/mod.ts";
import type { ClientInterface } from "@/client/client.ts";
import type { ComunicaQueryEngine } from "@/client/adapters/comunica/mod.ts";

import { DenokvRdfjsStore } from "./rdfjs-store/mod.ts";
import { DenokvSearchIndex } from "./search-index/mod.ts";
import {
  createDenokvPersistHooks,
  type DenokvPersistHooksOptions,
} from "./rdfjs-store/sync/create-denokv-persist-hooks.ts";
import { resolveImportLifecycle } from "@/client/import-lifecycle/mod.ts";
import type * as rdfjs from "@rdfjs/types";

/**
 * DenokvClientOptions specifies configuration parameters for Deno KV client contexts.
 */
export interface DenokvClientOptions extends DenokvPersistHooksOptions {
  /** queryEngine optionally enables built-in Comunica SPARQL over DenokvRdfjsStore. */
  queryEngine?: ComunicaQueryEngine;
}

/**
 * createDenokvClient synthesizes a Client over DenokvRdfjsStore.
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
  });

  const searchIndex = new DenokvSearchIndex({
    kv: options.kv,
    keyPrefix: options.keyPrefix,
  });

  return createAdapterClient({
    searchIndex,
    readSource: denokvRdfjsStore as unknown as rdfjs.Store,
    commitHandler: persistHooks.commitHandler,
    importLifecycle,
    queryEngine: options.queryEngine,
  });
}
