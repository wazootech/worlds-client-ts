import type { ClientInterface } from "@/client/client.ts";
import type { ComunicaQueryEngine } from "@/client/adapters/comunica/mod.ts";
import { createComunicaEngineWithBufferedCommit } from "@/client/adapters/comunica/mod.ts";

import type { LibsqlClientBaseOptions } from "./libsql-client-base-options.ts";
import { createLibsqlClientFromStores } from "./create-libsql-client-from-stores.ts";
import {
  createLibsqlClientInfrastructure,
  type LibsqlClientInfrastructure,
} from "./create-libsql-client-infrastructure.ts";
import { LibsqlQuadStore } from "./libsql-quad-store.ts";
import { LibsqlRdfjsStore } from "./libsql-rdfjs-store.ts";
import type { LibsqlPatchSyncState } from "./sync/libsql-patch-sync.ts";

/**
 * LibsqlClientOptions configures LibSQL execution through LibsqlRdfjsStore and hexastore indexes.
 */
export interface LibsqlClientOptions extends LibsqlClientBaseOptions {
  /** queryEngine optionally enables built-in Comunica SPARQL over LibsqlRdfjsStore. */
  queryEngine?: ComunicaQueryEngine;
}

/**
 * LibsqlStores bundles shared LibSQL quad and RDF/JS store facades.
 */
export interface LibsqlStores {
  /** libsqlQuadStore serves Client import and export. */
  libsqlQuadStore: LibsqlQuadStore;

  /** libsqlRdfjsStore serves Comunica SPARQL match and buffered updates. */
  libsqlRdfjsStore: LibsqlRdfjsStore;

  /** patchSync coordinates persistPatch and deferred import lifecycle hooks. */
  patchSync: LibsqlPatchSyncState;
}

/**
 * CreateLibsqlStoresOptions configures shared LibsqlRdfjsStore and LibsqlQuadStore wiring.
 */
export interface CreateLibsqlStoresOptions {
  /** infrastructure is shared schema, search, and patch-sync state. */
  infrastructure: LibsqlClientInfrastructure;

  /** client is the underlying LibSQL client. */
  client: LibsqlClientBaseOptions["client"];

  /** matchPageSize limits rows per LibsqlRdfjsStore.match SQL round-trip. */
  matchPageSize?: number;
}

/**
 * createLibsqlStores wires shared LibsqlRdfjsStore and LibsqlQuadStore instances.
 */
export function createLibsqlStores(
  options: CreateLibsqlStoresOptions,
): LibsqlStores {
  const libsqlRdfjsStore = new LibsqlRdfjsStore({
    client: options.client,
    queryBuilder: options.infrastructure.queryBuilder,
    commitHandler: options.infrastructure.patchSync.persistPatch,
    matchPageSize: options.matchPageSize,
  });
  const libsqlQuadStore = new LibsqlQuadStore({
    libsqlRdfjsStore,
    importLifecycle: options.infrastructure.patchSync,
  });

  return {
    libsqlQuadStore,
    libsqlRdfjsStore,
    patchSync: options.infrastructure.patchSync,
  };
}

/**
 * createLibsqlClient synthesizes a Client for LibsqlRdfjsStore + LibsqlQuadStore hexastore indexes.
 */
export async function createLibsqlClient(
  options: LibsqlClientOptions,
): Promise<ClientInterface> {
  const infrastructure = await createLibsqlClientInfrastructure(options);
  const { libsqlQuadStore, libsqlRdfjsStore } = createLibsqlStores({
    infrastructure,
    client: options.client,
    matchPageSize: options.matchPageSize,
  });

  return createLibsqlClientFromStores({
    infrastructure,
    libsqlQuadStore,
    libsqlRdfjsStore,
    createSparqlEngine: options.queryEngine
      ? ({ store }) =>
        createComunicaEngineWithBufferedCommit({
          queryEngine: options.queryEngine!,
          store,
        })
      : undefined,
  });
}
