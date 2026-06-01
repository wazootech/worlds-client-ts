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
import { noopImportLifecycle } from "@/client/import-lifecycle/mod.ts";

/**
 * RdfjsQuadStoreOptions configures RdfjsQuadStore dependencies.
 */
export interface RdfjsQuadStoreOptions {
  /** store is the underlying RDF/JS graph. */
  store: rdfjs.Store;

  /** importLifecycle runs before and after import (defaults to noop). */
  importLifecycle?: ImportLifecycle;
}

/**
 * RdfjsQuadStore is the standard implementation of the QuadStoreInterface that uses
 * an underlying in-memory or compatible RDFJS Store.
 */
export class RdfjsQuadStore implements QuadStoreInterface {
  private readonly store: rdfjs.Store;
  private readonly importLifecycle: ImportLifecycle;

  public constructor(storeOrOptions: rdfjs.Store | RdfjsQuadStoreOptions) {
    if (isRdfjsQuadStoreOptions(storeOrOptions)) {
      this.store = storeOrOptions.store;
      this.importLifecycle = storeOrOptions.importLifecycle ??
        noopImportLifecycle;
    } else {
      this.store = storeOrOptions;
      this.importLifecycle = noopImportLifecycle;
    }
  }

  public async import(request: ImportRequest): Promise<void> {
    const importCommitTarget = createImportCommitTarget({
      store: this.store,
      importLifecycle: this.importLifecycle,
    });
    await importViaBufferedRdfjsStore(request, {
      rdfjsStore: importCommitTarget,
    });
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
