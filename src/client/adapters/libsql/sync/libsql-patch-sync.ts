import type { TextSplitterInterface } from "@/client/search-index/quad-chunker/mod.ts";
import type { SearchIndexOnImport } from "@/client/quad-store/mod.ts";
import { createDeferredImportPatchSync } from "@/client/quad-store/mod.ts";
import type { PatchSyncState } from "@/client/quad-store/mod.ts";
import { commitPatchToLibsql } from "./commit-patch-to-libsql.ts";
import type { LibsqlClientBaseOptions } from "@/client/adapters/libsql/libsql-client-base-options.ts";
import type { LibsqlQueryBuilder } from "@/client/adapters/libsql/libsql-query-builder.ts";
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
 * LibsqlPatchSyncState coordinates commitPatchToLibsql with optional deferred search indexing.
 */
export type LibsqlPatchSyncState = PatchSyncState;

/**
 * createLibsqlPatchSyncState builds persistPatch and deferred-import helpers for LibSQL clients.
 */
export function createLibsqlPatchSyncState(
  dependencies: LibsqlPatchSyncAdapterOptions,
): LibsqlPatchSyncState {
  const searchIndexOnImport: SearchIndexOnImport | undefined =
    dependencies.searchIndexOnImport;

  const projectSearchIndex = searchIndexOnImport !== "disabled";
  const deferSearchDuringImport = searchIndexOnImport === "deferred";

  const reindex = createLibsqlSearchIndexRebuilder(dependencies);

  let skipSearchIndexForNextCommit = false;

  return createDeferredImportPatchSync({
    searchIndexOnImport,
    beforeImport: () => {
      skipSearchIndexForNextCommit = deferSearchDuringImport;
    },
    afterDeferredImport: async () => {
      await reindex();
    },
    persistPatch: async (patch, _context) => {
      await commitPatchToLibsql(patch, {
        ...dependencies,
        skipSearchIndexProjection: !projectSearchIndex ||
          skipSearchIndexForNextCommit,
      });
      skipSearchIndexForNextCommit = false;
    },
  });
}
