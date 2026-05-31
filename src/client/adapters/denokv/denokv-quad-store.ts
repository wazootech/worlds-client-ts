import {
  exportFromRdfjsStore,
  type ExportRequest,
  type ExportResponse,
  type ImportRequest,
  importViaBufferedRdfjsStore,
  type QuadStoreInterface,
} from "@/client/quad-store/mod.ts";
import type { ImportLifecycle } from "@/client/commit-sync/mod.ts";

import type { DenokvRdfjsStore } from "./denokv-rdfjs-store.ts";

/**
 * DenokvQuadStoreOptions configures DenokvQuadStore dependencies.
 */
export interface DenokvQuadStoreOptions {
  /** denokvRdfjsStore is the hexastore-backed RDF/JS store receiving buffered mutations. */
  denokvRdfjsStore: DenokvRdfjsStore;

  /** importLifecycle coordinates deferred external search indexing around import commits. */
  importLifecycle: ImportLifecycle;
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
      this.options.importLifecycle,
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
