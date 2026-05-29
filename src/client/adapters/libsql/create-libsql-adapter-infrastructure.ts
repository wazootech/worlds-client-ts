import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

import type { LibsqlClientBaseOptions } from "./libsql-client-base-options.ts";
import { LibsqlSearchIndex } from "@/client/adapters/libsql/search/mod.ts";
import {
  initializeLibsqlSchema,
  LibsqlQueryBuilder,
} from "@/client/adapters/libsql/store/mod.ts";
import {
  createLibsqlPatchSyncState,
  type LibsqlPatchSyncState,
} from "@/client/adapters/libsql/sync/mod.ts";

/**
 * LibsqlAdapterInfrastructure holds shared LibSQL schema, search, and patch-sync state.
 */
export interface LibsqlAdapterInfrastructure {
  /** queryBuilder supplies dimension-aware SQL for commits and reads. */
  queryBuilder: LibsqlQueryBuilder;

  /** searchIndex projects hybrid FTS and vector discovery over LibSQL chunks. */
  searchIndex: LibsqlSearchIndex;

  /** patchSync coordinates persistPatch and deferred search indexing on import. */
  patchSync: LibsqlPatchSyncState;
}

/**
 * createLibsqlAdapterInfrastructure provisions schema, search index, and patch sync for LibSQL adapters.
 */
export async function createLibsqlAdapterInfrastructure(
  options: LibsqlClientBaseOptions,
): Promise<LibsqlAdapterInfrastructure> {
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

  return { queryBuilder, searchIndex, patchSync };
}
