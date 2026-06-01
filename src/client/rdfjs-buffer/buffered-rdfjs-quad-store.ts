import type {
  ExportRequest,
  ExportResponse,
  ImportRequest,
  QuadStoreInterface,
} from "@/client/quad-store/mod.ts";
import {
  exportFromRdfjsStore,
  importViaBufferedRdfjsStore,
  type RdfjsExportSource,
} from "./import-export-via-rdfjs-store.ts";
import type { QuadTransaction } from "./transaction.ts";

/**
 * BufferedRdfjsQuadStoreOptions configures BufferedRdfjsQuadStore dependencies.
 */
export interface BufferedRdfjsQuadStoreOptions {
  /** createTransaction creates a QuadTransaction for atomic imports. */
  createTransaction: () => QuadTransaction;

  /** store provides a stream of quads for exports. */
  store: RdfjsExportSource;
}

/**
 * BufferedRdfjsQuadStore implements QuadStoreInterface over a transaction factory and read source.
 */
export class BufferedRdfjsQuadStore implements QuadStoreInterface {
  private readonly createTransaction: () => QuadTransaction;
  private readonly store: RdfjsExportSource;

  public constructor(options: BufferedRdfjsQuadStoreOptions) {
    this.createTransaction = options.createTransaction;
    this.store = options.store;
  }

  public async import(request: ImportRequest): Promise<void> {
    await importViaBufferedRdfjsStore(request, {
      createTransaction: this.createTransaction,
    });
  }

  public async export(request: ExportRequest): Promise<ExportResponse> {
    return await exportFromRdfjsStore(this.store, request);
  }
}
