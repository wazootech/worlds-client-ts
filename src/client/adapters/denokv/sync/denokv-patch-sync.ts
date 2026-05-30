import type { SearchIndexOnImport } from "@/client/quad-store/mod.ts";
import type {
  CommitHandler,
  ImportLifecycle,
} from "@/client/quad-store/mod.ts";
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
   * - `"disabled"`: same as incremental for Deno KV (no derived derived index).
   */
  searchIndexOnImport?: SearchIndexOnImport;

  /** reindex rebuilds an external search index after deferred import completes. */
  reindex?: () => Promise<void>;
}

/**
 * DenokvPatchSyncState coordinates Deno KV commit persisting with import lifecycle hooks.
 */
export interface DenokvPatchSyncState extends ImportLifecycle {
  /** persistPatch atomically persists a buffered patch to Deno KV durable storage. */
  persistPatch: CommitHandler;
}

/**
 * createDenokvPatchSyncState builds persistPatch and deferred-import helpers for Deno KV clients.
 */
export function createDenokvPatchSyncState(
  dependencies: DenokvPatchSyncAdapterOptions,
): DenokvPatchSyncState {
  const searchIndexOnImport = dependencies.searchIndexOnImport ?? "incremental";

  return {
    persistPatch: async (patch, context) => {
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
