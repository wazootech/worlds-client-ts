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
import type { QuadTransaction } from "./quad-transaction.ts";

/**
 * BufferedRdfjsQuadStoreOptions configures BufferedRdfjsQuadStore dependencies.
 */
export interface BufferedRdfjsQuadStoreOptions {
  /** transactionFactory creates a QuadTransaction for atomic imports. */
  transactionFactory: () => QuadTransaction;

  /** readSource provides a stream of quads for exports. */
  readSource: RdfjsExportSource;
}

/**
 * BufferedRdfjsQuadStore implements QuadStoreInterface over a transaction factory and read source.
 */
export class BufferedRdfjsQuadStore implements QuadStoreInterface {
  private readonly transactionFactory: () => QuadTransaction;
  private readonly readSource: RdfjsExportSource;

  public constructor(options: BufferedRdfjsQuadStoreOptions) {
    this.transactionFactory = options.transactionFactory;
    this.readSource = options.readSource;
  }

  public async import(request: ImportRequest): Promise<void> {
    await importViaBufferedRdfjsStore(request, {
      transactionFactory: this.transactionFactory,
    });
  }

  public async export(request: ExportRequest): Promise<ExportResponse> {
    return await exportFromRdfjsStore(this.readSource, request);
  }
}
