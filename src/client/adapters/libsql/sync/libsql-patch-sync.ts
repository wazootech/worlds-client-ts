import type { TextSplitterInterface } from "@/client/search-index/quad-chunker/mod.ts";
import { createImportPatchSyncState } from "@/client/quad-store/mod.ts";
import type { PatchSyncState } from "@/client/quad-store/mod.ts";
import { commitPatchToLibsql } from "./commit-patch-to-libsql.ts";
import type { LibsqlClientBaseOptions } from "@/client/adapters/libsql/libsql-client-base-options.ts";
import type { LibsqlQueryBuilder } from "@/client/adapters/libsql/sql/libsql-query-builder.ts";
import { createLibsqlSearchIndexRebuilder } from "@/client/adapters/libsql/search/rebuild-libsql-search-index-from-quads.ts";

/**
 * LibsqlPatchSyncAdapterOptions configures shared LibSQL quad/chunk synchronization.
 */
export interface LibsqlPatchSyncAdapterOptions extends LibsqlClientBaseOptions {
  /** libsqlQueryBuilder supplies dimension-aware SQL for commits and rebuilds. */
  libsqlQueryBuilder: LibsqlQueryBuilder;

  /** textSplitter is the text splitting facility used when projecting search chunks. */
  textSplitter: TextSplitterInterface;
}

/**
 * createLibsqlPatchSyncState builds persistPatch and deferred-import helpers for LibSQL clients.
 */
export function createLibsqlPatchSyncState(
  dependencies: LibsqlPatchSyncAdapterOptions,
): PatchSyncState {
  const reindex = createLibsqlSearchIndexRebuilder(dependencies);

  return createImportPatchSyncState({
    searchIndexOnImport: dependencies.searchIndexOnImport,
    searchIndexTopology: "materialized",
    afterDeferredImport: async () => {
      await reindex();
    },
    persistPatch: async (patch, context, projectionFlags) => {
      await commitPatchToLibsql(
        patch,
        {
          ...dependencies,
          skipSearchIndexProjection: projectionFlags.skipSearchIndexProjection,
        },
        context,
      );
    },
  });
}
