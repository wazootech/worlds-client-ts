import type { TextSplitterInterface } from "@/client/search-index/quad-chunker/mod.ts";
import type { Patch } from "@/client/quad-store/mod.ts";
import { commitPatchToLibsql } from "./commit-patch-to-libsql.ts";
import type { LibsqlClientBaseOptions } from "@/client/adapters/libsql/libsql-client-base-options.ts";
import type { LibsqlQueryBuilder } from "@/client/adapters/libsql/libsql-query-builder.ts";
import {
  createLibsqlSearchIndexRebuilder,
  type RebuildLibsqlSearchIndexFromQuadsResult,
} from "@/client/adapters/libsql/search/rebuild-libsql-search-index-from-quads.ts";

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
export interface LibsqlPatchSyncState {
  /** persistPatch commits a patch to LibSQL using the current defer-search flag. */
  persistPatch: (patch: Patch) => Promise<void>;

  /** beforeImport applies deferred search indexing before the next commit. */
  beforeImport: () => void;

  /** afterImport rebuilds search chunks when searchIndexOnImport is "deferred". */
  afterImport: () => Promise<
    RebuildLibsqlSearchIndexFromQuadsResult | undefined
  >;
}

/**
 * createLibsqlPatchSyncState builds persistPatch and deferred-import helpers for LibSQL clients.
 */
export function createLibsqlPatchSyncState(
  dependencies: LibsqlPatchSyncAdapterOptions,
): LibsqlPatchSyncState {
  const { searchIndexOnImport } = dependencies;

  const projectSearchIndex = searchIndexOnImport !== "disabled";
  const deferSearchDuringImport = searchIndexOnImport === "deferred";

  const reindex = createLibsqlSearchIndexRebuilder(dependencies);

  let skipSearchIndexForNextCommit = false;

  return {
    persistPatch: async (patch: Patch) => {
      await commitPatchToLibsql(patch, {
        ...dependencies,
        skipSearchIndexProjection: !projectSearchIndex ||
          skipSearchIndexForNextCommit,
      });
      skipSearchIndexForNextCommit = false;
    },

    beforeImport: () => {
      skipSearchIndexForNextCommit = deferSearchDuringImport;
    },

    afterImport: async () => {
      if (!deferSearchDuringImport) {
        return undefined;
      }
      return await reindex();
    },
  };
}
