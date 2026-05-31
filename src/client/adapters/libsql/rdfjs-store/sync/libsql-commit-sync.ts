import type { TextSplitterInterface } from "@/client/search-index/quad-chunker/mod.ts";
import type { CommitSyncState } from "@/client/commit-sync/mod.ts";
import { commitPatchToLibsql } from "./commit-patch-to-libsql.ts";
import type { LibsqlClientBaseOptions } from "@/client/adapters/libsql/libsql-client-base-options.ts";
import type { LibsqlQueryBuilder } from "../sql/libsql-query-builder.ts";
import { createLibsqlSearchIndexRebuilder } from "../../search-index/rebuild-libsql-search-index-from-quads.ts";

/**
 * LibsqlCommitSyncOptions configures shared LibSQL quad/chunk synchronization.
 */
export interface LibsqlCommitSyncOptions extends LibsqlClientBaseOptions {
  /** libsqlQueryBuilder supplies dimension-aware SQL for commits and rebuilds. */
  libsqlQueryBuilder: LibsqlQueryBuilder;

  /** textSplitter is the text splitting facility used when projecting search chunks. */
  textSplitter: TextSplitterInterface;
}

/**
 * createLibsqlCommitSync builds commit and deferred-import helpers for LibSQL clients.
 */
export function createLibsqlCommitSync(
  dependencies: LibsqlCommitSyncOptions,
): CommitSyncState {
  const reindex = createLibsqlSearchIndexRebuilder(dependencies);
  const searchIndexOnImport = dependencies.searchIndexOnImport ?? "incremental";

  return {
    commit: async (patch, context) => {
      const isImport = context?.importMode !== undefined;
      const skipSearchIndexProjection =
        dependencies.searchIndexOnImport === "disabled" ||
        (isImport && searchIndexOnImport === "deferred");

      await commitPatchToLibsql(
        patch,
        {
          ...dependencies,
          skipSearchIndexProjection,
        },
        context,
      );
    },

    beforeImport: () => {},

    afterImport: async (): Promise<void> => {
      if (searchIndexOnImport === "deferred") {
        await reindex();
      }
    },
  };
}
