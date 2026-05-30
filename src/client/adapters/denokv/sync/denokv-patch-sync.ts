import type { ImportLifecycle } from "@/client/quad-store/mod.ts";
import type { Patch, PatchCommitContext } from "@/client/quad-store/mod.ts";

import {
  commitPatchToDenokv,
  type CommitPatchToDenokvOptions,
} from "./commit-patch-to-denokv.ts";

/**
 * DenokvPatchSyncAdapterOptions configures shared Deno KV patch synchronization.
 */
export interface DenokvPatchSyncAdapterOptions
  extends CommitPatchToDenokvOptions {
  /**
   * searchIndexOnImport controls deferred external search indexing during bulk import.
   *
   * - `"incremental"` (default when omitted): no import defer hooks.
   * - `"deferred"`: `beforeImport` / `afterImport` coordinate a caller-provided `reindex`.
   * - `"disabled"`: same as incremental for Deno KV (no built-in derived index).
   */
  searchIndexOnImport?: "incremental" | "deferred" | "disabled";

  /** reindex rebuilds an external search index after deferred import completes. */
  reindex?: () => Promise<void>;
}

/**
 * DenokvPatchSyncState coordinates commitPatchToDenokv with optional deferred external search indexing.
 */
export interface DenokvPatchSyncState extends ImportLifecycle {
  /** persistPatch commits a patch to Deno KV using the current import context. */
  persistPatch: (
    patch: Patch,
    context?: PatchCommitContext,
  ) => Promise<void>;
}

/**
 * createDenokvPatchSyncState builds persistPatch and deferred-import helpers for Deno KV clients.
 */
export function createDenokvPatchSyncState(
  dependencies: DenokvPatchSyncAdapterOptions,
): DenokvPatchSyncState {
  const deferSearchDuringImport =
    dependencies.searchIndexOnImport === "deferred";

  return {
    persistPatch: async (patch, context) => {
      await commitPatchToDenokv(patch, dependencies, context);
    },

    beforeImport: () => {},

    afterImport: async (): Promise<void> => {
      if (!deferSearchDuringImport || !dependencies.reindex) {
        return;
      }
      await dependencies.reindex();
    },
  };
}
