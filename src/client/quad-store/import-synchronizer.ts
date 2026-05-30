import type { CommitHandler } from "./commit-handler.ts";

/**
 * ImportLifecycle runs adapter-specific work immediately before and after quad import persistence.
 */
export interface ImportLifecycle {
  /**
   * beforeImport runs before import writes quads to durable or in-memory storage.
   */
  beforeImport(): void;

  /**
   * afterImport runs after import persistence completes (including any RDF/JS commit flush).
   */
  afterImport(): Promise<void>;
}

/**
 * noopImportLifecycle is the default import lifecycle for backends without deferred indexing.
 */
export const noopImportLifecycle: ImportLifecycle = {
  beforeImport() {},
  afterImport() {
    return Promise.resolve();
  },
};

/**
 * runImportWithLifecycle invokes importLifecycle around an import body.
 */
export async function runImportWithLifecycle(
  importLifecycle: ImportLifecycle,
  importBody: () => Promise<void>,
): Promise<void> {
  importLifecycle.beforeImport();
  await importBody();
  await importLifecycle.afterImport();
}

/**
 * PatchSyncState coordinates commit persisting with import lifecycle hooks.
 */
export interface PatchSyncState extends ImportLifecycle {
  /** commit atomically persists a buffered patch to durable storage. */
  commit: CommitHandler;
}
