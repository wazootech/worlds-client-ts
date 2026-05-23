import type { TextSplitterInterface } from "@/client/search-index/quad-chunker/mod.ts";
import type { Patch } from "@/client/quad-store/mod.ts";
import type { ImportRequest } from "@/client/quad-store/mod.ts";
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

  /** prepareDeferredImport sets whether the next commit skips chunk projection. */
  prepareDeferredImport: (request: ImportRequest) => void;

  /** finalizeDeferredImport rebuilds search chunks when import used deferSearchIndex. */
  finalizeDeferredImport: (
    request: ImportRequest,
  ) => Promise<RebuildLibsqlSearchIndexFromQuadsResult | undefined>;
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
    quadFilter,
    libsqlQueryBuilder,
    labelPredicates,
  } = dependencies;

  const commitPatchOptions: Omit<
    CommitPatchToLibsqlOptions,
    "skipSearchIndexProjection"
  > = {
    client,
    embeddingService,
    textSplitter,
    maxLookupChunkSize,
    quadFilter,
    libsqlQueryBuilder,
    labelPredicates,
  };

  const rebuildSearchIndex = createLibsqlSearchIndexRebuilder({
    client,
    libsqlQueryBuilder,
    embeddingService,
    textSplitter,
    maxLookupChunkSize,
    quadFilter,
    labelPredicates,
  });

  let skipSearchIndexForNextCommit = false;

  return {
    persistPatch: async (patch: Patch) => {
      await commitPatchToLibsql(patch, {
        ...commitPatchOptions,
        skipSearchIndexProjection: skipSearchIndexForNextCommit,
      });
      skipSearchIndexForNextCommit = false;
    },

    prepareDeferredImport: (request: ImportRequest) => {
      skipSearchIndexForNextCommit = request.deferSearchIndex === true;
    },

    finalizeDeferredImport: async (request: ImportRequest) => {
      if (!request.deferSearchIndex) {
        return undefined;
      }
      return await rebuildSearchIndex();
    },
  };
}
