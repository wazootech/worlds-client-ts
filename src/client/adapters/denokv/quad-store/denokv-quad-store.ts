import {
  exportFromRdfjsStore,
  type ExportRequest,
  type ExportResponse,
  type ImportRequest,
  importViaBufferedRdfjsStore,
  type QuadStoreInterface,
} from "@/client/quad-store/mod.ts";
import { resolveImportLifecycle } from "@/client/import-lifecycle/mod.ts";

import type { DenokvRdfjsStore } from "../rdfjs-store/mod.ts";

/**
 * DenokvQuadStoreOptions configures DenokvQuadStore dependencies.
 */
export interface DenokvQuadStoreOptions {
  /** denokvRdfjsStore is the hexastore-backed RDF/JS store receiving buffered mutations. */
  denokvRdfjsStore: DenokvRdfjsStore;

  /** beforeImport runs before import writes quads (optional). */
  beforeImport?: () => void;

  /** afterImport runs after import persistence completes (optional). */
  afterImport?: () => Promise<void>;
}

/**
 * DenokvQuadStore implements QuadStoreInterface over DenokvRdfjsStore with Deno KV import lifecycle orchestration.
 */
export class DenokvQuadStore implements QuadStoreInterface {
  public constructor(
    private readonly options: DenokvQuadStoreOptions,
  ) {}

  public async import(request: ImportRequest): Promise<void> {
    await importViaBufferedRdfjsStore(
      request,
      resolveImportLifecycle({
        beforeImport: this.options.beforeImport,
        afterImport: this.options.afterImport,
      }),
      {
        rdfjsStore: this.options.denokvRdfjsStore,
      },
    );
  }

  public async export(request: ExportRequest): Promise<ExportResponse> {
    return await exportFromRdfjsStore(
      this.options.denokvRdfjsStore,
      request,
    );
  }
}
