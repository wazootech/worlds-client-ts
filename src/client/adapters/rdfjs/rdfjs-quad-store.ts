import type * as rdfjs from "@rdfjs/types";
import type {
  ExportRequest,
  ExportResponse,
  ImportRequest,
  QuadStoreInterface,
} from "@/client/quad-store/mod.ts";
import {
  createImportCommitTarget,
  exportFromRdfjsStore,
  importViaBufferedRdfjsStore,
} from "@/client/rdfjs-buffer/mod.ts";
import type { ImportLifecycle } from "@/client/import-lifecycle/mod.ts";
import {
  noopImportLifecycle,
  resolveImportLifecycle,
} from "@/client/import-lifecycle/mod.ts";

/**
 * RdfjsQuadStoreOptions configures RdfjsQuadStore dependencies.
 */
export interface RdfjsQuadStoreOptions {
  /** store is the underlying RDF/JS graph. */
  store: rdfjs.Store;

  /** beforeImport runs before import writes quads (optional). */
  beforeImport?: () => void;

  /** afterImport runs after import persistence completes (optional). */
  afterImport?: () => Promise<void>;

  /** importLifecycle is shorthand for beforeImport and afterImport (optional). */
  importLifecycle?: ImportLifecycle;
}

/**
 * RdfjsQuadStore is the standard implementation of the QuadStoreInterface that uses
 * an underlying in-memory or compatible RDFJS Store.
 */
export class RdfjsQuadStore implements QuadStoreInterface {
  private readonly store: rdfjs.Store;
  private readonly beforeImport?: () => void;
  private readonly afterImport?: () => Promise<void>;

  public constructor(store: rdfjs.Store);
  public constructor(options: RdfjsQuadStoreOptions);
  public constructor(
    storeOrOptions: rdfjs.Store | RdfjsQuadStoreOptions,
    importLifecycle?: ImportLifecycle,
  ) {
    if (isRdfjsQuadStoreOptions(storeOrOptions)) {
      this.store = storeOrOptions.store;
      this.beforeImport = storeOrOptions.beforeImport ??
        storeOrOptions.importLifecycle?.beforeImport;
      this.afterImport = storeOrOptions.afterImport ??
        storeOrOptions.importLifecycle?.afterImport;
    } else {
      this.store = storeOrOptions;
      this.beforeImport = importLifecycle?.beforeImport;
      this.afterImport = importLifecycle?.afterImport;
    }
  }

  public async import(request: ImportRequest): Promise<void> {
    const importCommitTarget = createImportCommitTarget({ store: this.store });
    await importViaBufferedRdfjsStore(
      request,
      resolveImportLifecycle({
        beforeImport: this.beforeImport ?? noopImportLifecycle.beforeImport,
        afterImport: this.afterImport ?? noopImportLifecycle.afterImport,
      }),
      { rdfjsStore: importCommitTarget },
    );
  }

  public async export(request: ExportRequest): Promise<ExportResponse> {
    return await exportFromRdfjsStore(this.store, request);
  }
}

function isRdfjsQuadStoreOptions(
  value: rdfjs.Store | RdfjsQuadStoreOptions,
): value is RdfjsQuadStoreOptions {
  return typeof value === "object" && value !== null && "store" in value;
}
