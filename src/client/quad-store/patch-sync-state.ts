import type { ImportLifecycle } from "./import-lifecycle.ts";
import type { CommitHandler, PatchCommitContext } from "./commit-handler.ts";
import type { Patch } from "./patch.ts";
import {
  type ImportCommitProjectionFlags,
  type ImportIndexingPolicyOptions,
  resolveImportCommitProjectionFlags,
  type SearchIndexOnImport,
  shouldRunDeferredImportReindex,
} from "./import-indexing-policy.ts";

export type { SearchIndexOnImport };

/**
 * PatchSyncState coordinates persistPatch with optional deferred import lifecycle hooks.
 */
export interface PatchSyncState extends ImportLifecycle {
  /** persistPatch atomically persists a buffered patch to durable storage. */
  persistPatch: CommitHandler;
}

/**
 * PersistPatchWithProjectionFlags atomically persists a patch with search projection flags.
 */
export type PersistPatchWithProjectionFlags = (
  patch: Patch,
  context: PatchCommitContext | undefined,
  projectionFlags: ImportCommitProjectionFlags,
) => Promise<void>;

/**
 * CreateImportPatchSyncStateOptions configures shared import patch sync behavior.
 */
export interface CreateImportPatchSyncStateOptions
  extends ImportIndexingPolicyOptions {
  /** persistPatch commits a patch to the durable backend. */
  persistPatch: PersistPatchWithProjectionFlags;

  /** beforeImport runs immediately before import body execution. */
  beforeImport?: () => void;

  /** afterDeferredImport runs after import when deferred reindex is eligible. */
  afterDeferredImport?: () => Promise<void>;
}

/**
 * createImportPatchSyncState builds persistPatch and import lifecycle hooks from indexing policy.
 */
export function createImportPatchSyncState(
  options: CreateImportPatchSyncStateOptions,
): PatchSyncState {
  const policy: ImportIndexingPolicyOptions = {
    searchIndexOnImport: options.searchIndexOnImport,
    searchIndexTopology: options.searchIndexTopology,
  };

  let importCommitInFlight = false;

  return {
    persistPatch: async (patch, context) => {
      const projectionFlags = resolveImportCommitProjectionFlags(
        policy,
        importCommitInFlight ? "duringImportCommit" : "sparqlUpdateCommit",
      );
      try {
        await options.persistPatch(patch, context, projectionFlags);
      } finally {
        importCommitInFlight = false;
      }
    },

    beforeImport: () => {
      importCommitInFlight = true;
      options.beforeImport?.();
    },

    afterImport: async (): Promise<void> => {
      if (
        !shouldRunDeferredImportReindex(
          policy,
          options.afterDeferredImport !== undefined,
        )
      ) {
        return;
      }
      await options.afterDeferredImport!();
    },
  };
}
