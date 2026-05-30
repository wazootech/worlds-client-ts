import type { ImportLifecycle } from "./import-lifecycle.ts";
import type { CommitHandler } from "./commit-handler.ts";

/**
 * SearchIndexOnImport controls when search chunk projection runs during bulk import.
 */
export type SearchIndexOnImport = "incremental" | "deferred" | "disabled";

/**
 * PatchSyncState coordinates persistPatch with optional deferred import lifecycle hooks.
 */
export interface PatchSyncState extends ImportLifecycle {
  /** persistPatch atomically persists a buffered patch to durable storage. */
  persistPatch: CommitHandler;
}

/**
 * CreateDeferredImportPatchSyncOptions configures shared deferred-import patch sync behavior.
 */
export interface CreateDeferredImportPatchSyncOptions {
  /** searchIndexOnImport controls whether afterImport runs a deferred reindex pass. */
  searchIndexOnImport?: SearchIndexOnImport;

  /** persistPatch commits a patch to the durable backend. */
  persistPatch: CommitHandler;

  /** beforeImport runs immediately before import body execution. */
  beforeImport?: () => void;

  /** afterDeferredImport runs after import when searchIndexOnImport is "deferred". */
  afterDeferredImport?: () => Promise<void>;
}

/**
 * createDeferredImportPatchSync builds persistPatch and optional deferred-import lifecycle hooks.
 */
export function createDeferredImportPatchSync(
  options: CreateDeferredImportPatchSyncOptions,
): PatchSyncState {
  const deferSearchDuringImport = options.searchIndexOnImport === "deferred";

  return {
    persistPatch: options.persistPatch,

    beforeImport: () => {
      options.beforeImport?.();
    },

    afterImport: async (): Promise<void> => {
      if (!deferSearchDuringImport || !options.afterDeferredImport) {
        return;
      }
      await options.afterDeferredImport();
    },
  };
}
