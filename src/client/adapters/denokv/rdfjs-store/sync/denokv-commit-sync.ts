import type { CommitSyncState } from "@/client/commit-sync/mod.ts";
import type { SearchIndexOnImport } from "@/client/search-index/mod.ts";
import {
  commitPatchToDenokv,
  type CommitPatchToDenokvOptions,
} from "./commit-patch-to-denokv.ts";

/**
 * DenokvCommitSyncOptions configures shared Deno KV patch synchronization.
 */
export interface DenokvCommitSyncOptions extends CommitPatchToDenokvOptions {
  /**
   * searchIndexOnImport controls deferred external search indexing during bulk import.
   *
   * - `"incremental"` (default when omitted): no import defer hooks.
   * - `"deferred"`: `beforeImport` / `afterImport` coordinate a caller-provided `reindex`.
   * - `"disabled"`: same as incremental for Deno KV (no derived derived index).
   */
  searchIndexOnImport?: SearchIndexOnImport;

  /** reindex rebuilds an external search index after deferred import completes. */
  reindex?: () => Promise<void>;
}

/**
 * createDenokvCommitSync builds commit and deferred-import helpers for Deno KV clients.
 */
export function createDenokvCommitSync(
  dependencies: DenokvCommitSyncOptions,
): CommitSyncState {
  const searchIndexOnImport = dependencies.searchIndexOnImport ?? "incremental";

  return {
    commit: async (patch, context) => {
      await commitPatchToDenokv(patch, dependencies, context);
    },

    beforeImport: () => {},

    afterImport: async (): Promise<void> => {
      if (searchIndexOnImport === "deferred" && dependencies.reindex) {
        await dependencies.reindex();
      }
    },
  };
}
