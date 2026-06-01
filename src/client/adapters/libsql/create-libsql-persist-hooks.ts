import type { CommitHandler } from "@/client/quad-store/mod.ts";
import type { TextSplitterInterface } from "@/client/search-index/quad-chunker/mod.ts";
import { commitPatchToLibsql } from "./commit-patch-to-libsql.ts";
import { projectSearchChunks } from "./search-index/project-search-chunks.ts";
import { refreshSearchChunksForSubjects } from "./search-index/refresh-search-chunks-for-subjects.ts";
import type { LibsqlClientBaseOptions } from "@/client/adapters/libsql/libsql-client-base-options.ts";
import type { LibsqlQueryBuilder } from "./libsql-query-builder.ts";
import { rebuildLibsqlSearchIndexFromQuads } from "./search-index/rebuild-libsql-search-index-from-quads.ts";

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

  /** textSplitter is the text splitting facility used when projecting search chunks. */
  textSplitter: TextSplitterInterface;
}

/**
 * createLibsqlPersistHooks builds commitHandler and deferred-import helpers for LibSQL clients.
 */
export function createLibsqlPersistHooks(
  dependencies: LibsqlPersistHooksOptions,
): LibsqlPersistHooks {
  const reindex = () => rebuildLibsqlSearchIndexFromQuads(dependencies);
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
          {
            ...dependencies,
          },
          context,
        );

      if (!skipSearchIndexProjection) {
        if (novelQuadIds.length > 0) {
          await projectSearchChunks(
            novelInsertions,
            novelQuadIds,
            dependencies,
          );
        }

        if (labelTouchedSubjects.length > 0) {
          await refreshSearchChunksForSubjects(
            labelTouchedSubjects,
            dependencies,
          );
        }
      }

      if (isImport && searchIndexOnImport === "deferred") {
        await reindex();
      }
    },
  };
}
