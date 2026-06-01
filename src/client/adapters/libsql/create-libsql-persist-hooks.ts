import type { CommitHandler } from "@/client/quad-store/mod.ts";
import type { LibsqlSearchIndexProjector } from "./search-index/mod.ts";
import { commitPatchToLibsql } from "./commit-patch-to-libsql.ts";
import type { LibsqlClientBaseOptions } from "./libsql-client-base-options.ts";
import type { LibsqlQueryBuilder } from "./libsql-query-builder.ts";

/**
 * LibsqlPersistHooks bundles commitHandler and import lifecycle callbacks for LibSQL clients.
 */
export interface LibsqlPersistHooks {
  /** commit persists buffered patches to LibSQL. */
  commit: CommitHandler;
}

/**
 * LibsqlPersistHooksOptions configures shared LibSQL quad/chunk synchronization.
 */
export interface LibsqlPersistHooksOptions extends LibsqlClientBaseOptions {
  /** libsqlQueryBuilder supplies dimension-aware SQL for commits and rebuilds. */
  libsqlQueryBuilder: LibsqlQueryBuilder;

  /** searchIndexProjector manages vector embedding and text chunk synchronisation. */
  searchIndexProjector?: LibsqlSearchIndexProjector;
}

/**
 * createLibsqlPersistHooks builds commitHandler and deferred-import helpers for LibSQL clients.
 */
export function createLibsqlPersistHooks(
  dependencies: LibsqlPersistHooksOptions,
): LibsqlPersistHooks {
  const searchIndexOnImport = dependencies.searchIndexOnImport ?? "incremental";

  return {
    commit: async (patch, context) => {
      const isImport = context?.importMode !== undefined;
      const skipSearchIndexProjection =
        dependencies.searchIndexOnImport === "disabled" ||
        (isImport && searchIndexOnImport === "deferred");

      const { novelInsertions, novelQuadIds, labelTouchedSubjects } =
        await commitPatchToLibsql(
          patch,
          dependencies,
          context,
        );

      if (!skipSearchIndexProjection && dependencies.searchIndexProjector) {
        await dependencies.searchIndexProjector.projectNovelQuads(
          novelInsertions,
          novelQuadIds,
          labelTouchedSubjects,
        );
      }

      if (
        isImport && searchIndexOnImport === "deferred" &&
        dependencies.searchIndexProjector
      ) {
        await dependencies.searchIndexProjector.reindexAll();
      }
    },
  };
}
