import type { CommitHandler } from "@/client/quad-store/mod.ts";
import type { TextSplitterInterface } from "@/client/search-index/quad-chunker/mod.ts";
import { commitPatchToLibsql } from "./commit-patch-to-libsql.ts";
import type { LibsqlClientBaseOptions } from "@/client/adapters/libsql/libsql-client-base-options.ts";
import type { LibsqlQueryBuilder } from "../sql/libsql-query-builder.ts";
import { createLibsqlSearchIndexRebuilder } from "../../search-index/rebuild-libsql-search-index-from-quads.ts";

/**
 * LibsqlPersistHooks bundles commitHandler and import lifecycle callbacks for LibSQL clients.
 */
export interface LibsqlPersistHooks {
  /** commitHandler persists buffered patches to LibSQL. */
  commitHandler: CommitHandler;
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
  const reindex = createLibsqlSearchIndexRebuilder(dependencies);
  const searchIndexOnImport = dependencies.searchIndexOnImport ?? "incremental";

  return {
    commitHandler: async (patch, context) => {
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

      if (isImport && searchIndexOnImport === "deferred") {
        await reindex();
      }
    },
  };
}
