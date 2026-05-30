import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

import type { ClientInterface } from "@/client/client.ts";
import type { ComunicaQueryEngine } from "@/client/adapters/comunica/mod.ts";
import { LibsqlSearchIndex } from "@/client/adapters/libsql/search/mod.ts";
import { createLibsqlPatchSyncState } from "@/client/adapters/libsql/sync/mod.ts";
import { wireDurableClient } from "@/client/wire-durable-client.ts";

import type { LibsqlClientBaseOptions } from "./libsql-client-base-options.ts";
import { LibsqlQuadStore } from "./libsql-quad-store.ts";
import { LibsqlRdfjsStore } from "./libsql-rdfjs-store.ts";
import { initializeLibsqlSchema } from "./sql/initialize-libsql-schema.ts";
import { LibsqlQueryBuilder } from "./sql/libsql-query-builder.ts";

/**
 * LibsqlClientOptions configures LibSQL execution through LibsqlRdfjsStore and hexastore indexes.
 */
export interface LibsqlClientOptions extends LibsqlClientBaseOptions {
  /** queryEngine optionally enables built-in Comunica SPARQL over LibsqlRdfjsStore. */
  queryEngine?: ComunicaQueryEngine;
}

/**
 * createLibsqlClient synthesizes a Client for LibsqlRdfjsStore + LibsqlQuadStore hexastore indexes.
 */
export async function createLibsqlClient(
  options: LibsqlClientOptions,
): Promise<ClientInterface> {
  const vectorDimensions = options.vectorDimensions ?? 32;
  const queryBuilder = new LibsqlQueryBuilder(vectorDimensions);

  await initializeLibsqlSchema(options.client, queryBuilder);

  const textSplitter = options.textSplitter ??
    new RecursiveCharacterTextSplitter({ chunkSize: 1000 });

  const searchIndex = new LibsqlSearchIndex({
    ...options,
    libsqlQueryBuilder: queryBuilder,
    textSplitter,
  });

  const patchSync = createLibsqlPatchSyncState({
    ...options,
    libsqlQueryBuilder: queryBuilder,
    textSplitter,
  });

  const libsqlRdfjsStore = new LibsqlRdfjsStore({
    client: options.client,
    queryBuilder,
    commitHandler: patchSync.persistPatch,
    matchPageSize: options.matchPageSize,
  });
  const libsqlQuadStore = new LibsqlQuadStore({
    libsqlRdfjsStore,
    importLifecycle: patchSync,
  });

  return wireDurableClient({
    quadStore: libsqlQuadStore,
    searchIndex,
    rdfjsStoreForSparql: libsqlRdfjsStore,
    queryEngine: options.queryEngine,
    capabilities: { searchIndexTopology: "materialized" },
  });
}
