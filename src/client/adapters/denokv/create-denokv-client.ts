import { Client } from "@/client/client.ts";
import type * as rdfjs from "@rdfjs/types";
import type { ClientInterface } from "@/client/client.ts";
import type { ComunicaQueryEngine } from "@/client/adapters/comunica/mod.ts";
import { ComunicaSparqlEngine } from "@/client/adapters/comunica/mod.ts";

import { DenokvRdfjsStore } from "./rdfjs-store/mod.ts";
import { DenokvSearchIndex } from "./search-index/mod.ts";
import {
  createDenokvPersistHooks,
  type DenokvPersistHooksOptions,
} from "./create-denokv-persist-hooks.ts";
import { RdfjsQuadStore } from "@/client/adapters/rdfjs/rdfjs-quad-store.ts";
import { Transaction } from "@/client/quad-store/mod.ts";

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

  const denokvRdfjsStore = new DenokvRdfjsStore({
    kv: options.kv,
    keyPrefix: options.keyPrefix,
    enabledQuadIndexes: options.enabledQuadIndexes,
  });

  const searchIndex = new DenokvSearchIndex({
    kv: options.kv,
    keyPrefix: options.keyPrefix,
  });

  const quadStore = new RdfjsQuadStore({
    store: denokvRdfjsStore as unknown as rdfjs.Store,
    commit: persistHooks.commit,
  });

  const sparqlEngine = options.queryEngine
    ? new ComunicaSparqlEngine({
      queryEngine: options.queryEngine,
      store: denokvRdfjsStore as unknown as rdfjs.Store,
      createTransaction: () => new Transaction({ commit: persistHooks.commit }),
    })
    : undefined;

  return new Client({
    quadStore,
    searchIndex,
    sparqlEngine,
  });
}
