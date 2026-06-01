import {
  exportFromRdfjsStore,
  type ExportRequest,
  type ExportResponse,
  type ImportRequest,
  importViaBufferedRdfjsStore,
  type QuadStoreInterface,
} from "@/client/quad-store/mod.ts";

import type { DenokvRdfjsStore } from "../rdfjs-store/mod.ts";

/**
 * DenokvQuadStoreOptions configures DenokvQuadStore dependencies.
 */
export interface DenokvQuadStoreOptions {
  /** denokvRdfjsStore is the hexastore-backed RDF/JS store receiving buffered mutations. */
  denokvRdfjsStore: DenokvRdfjsStore;
}

/**
 * DenokvQuadStore implements QuadStoreInterface over DenokvRdfjsStore.
 */
export class DenokvQuadStore implements QuadStoreInterface {
  public constructor(
    private readonly options: DenokvQuadStoreOptions,
  ) {}

  public async import(request: ImportRequest): Promise<void> {
    await importViaBufferedRdfjsStore(request, {
      rdfjsStore: this.options.denokvRdfjsStore,
    });
  }

  public async export(request: ExportRequest): Promise<ExportResponse> {
    return await exportFromRdfjsStore(
      this.options.denokvRdfjsStore,
      request,
    );
  }
}
