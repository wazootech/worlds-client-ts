import type { TextSplitterInterface } from "@/client/search-index/quad-chunker/mod.ts";
import type { Patch } from "@/client/quad-store/mod.ts";
import {
  commitPatchToLibsql,
  type CommitPatchToLibsqlOptions,
} from "./commit-patch-to-libsql.ts";
import type { LibsqlClientBaseOptions } from "./libsql-client-base-options.ts";
import type { LibsqlQueryBuilder } from "./libsql-query-builder.ts";
import {
  createLibsqlSearchIndexRebuilder,
  type RebuildLibsqlSearchIndexFromQuadsResult,
} from "./rebuild-libsql-search-index-from-quads.ts";

/**
 * LibsqlPatchSyncDependencies configures shared LibSQL quad/chunk synchronization.
 */
export interface LibsqlPatchSyncDependencies extends LibsqlClientBaseOptions {
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

  /** beforeImport applies deferSearchIndexOnImport before the next commit. */
  beforeImport: () => void;

  /** afterImport rebuilds search chunks when deferSearchIndexOnImport is enabled. */
  afterImport: () => Promise<
    RebuildLibsqlSearchIndexFromQuadsResult | undefined
  >;
}

/**
 * createLibsqlPatchSyncState builds persistPatch and deferred-import helpers for LibSQL clients.
 */
export function createLibsqlPatchSyncState(
  dependencies: LibsqlPatchSyncDependencies,
): LibsqlPatchSyncState {
  const {
    client,
    embeddingService,
    textSplitter,
    maxLookupChunkSize,
    include,
    exclude,
    libsqlQueryBuilder,
    labelPredicates,
    searchIndexOnImport,
    deferSearchIndexOnImport,
  } = dependencies;

  const projectSearchIndex = searchIndexOnImport !== false;
  const deferSearchDuringImport = projectSearchIndex &&
    deferSearchIndexOnImport === true;

  const commitPatchOptions: Omit<
    CommitPatchToLibsqlOptions,
    "skipSearchIndexProjection"
  > = {
    client,
    embeddingService,
    textSplitter,
    maxLookupChunkSize,
    include,
    exclude,
    libsqlQueryBuilder,
    labelPredicates,
  };

  const rebuildSearchIndex = createLibsqlSearchIndexRebuilder({
    client,
    libsqlQueryBuilder,
    embeddingService,
    textSplitter,
    maxLookupChunkSize,
    include,
    exclude,
    labelPredicates,
  });

  let skipSearchIndexForNextCommit = false;

  return {
    persistPatch: async (patch: Patch) => {
      await commitPatchToLibsql(patch, {
        ...commitPatchOptions,
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
      return await rebuildSearchIndex();
    },
  };
}
