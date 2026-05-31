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
 * resolveImportLifecycle builds an ImportLifecycle from optional import hooks.
 */
export function resolveImportLifecycle(options: {
  beforeImport?: () => void;
  afterImport?: () => Promise<void>;
}): ImportLifecycle {
  return {
    beforeImport: options.beforeImport ?? noopImportLifecycle.beforeImport,
    afterImport: options.afterImport ?? noopImportLifecycle.afterImport,
  };
}

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
