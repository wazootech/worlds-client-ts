import type {
  ExportRequest,
  ExportResponse,
  ImportRequest,
  QuadStoreInterface,
} from "@/client/quad-store/mod.ts";
import {
  exportFromRdfjsStore,
  type ImportCommitTarget,
  importViaBufferedRdfjsStore,
} from "./import-export-via-rdfjs-store.ts";

/**
 * BufferedRdfjsQuadStoreOptions configures BufferedRdfjsQuadStore dependencies.
 */
export interface BufferedRdfjsQuadStoreOptions {
  /** rdfjsStore is the committing RDF/JS store receiving buffered import mutations. */
  rdfjsStore: ImportCommitTarget;
}

/**
 * BufferedRdfjsQuadStore implements QuadStoreInterface over an ImportCommitTarget.
 */
export class BufferedRdfjsQuadStore implements QuadStoreInterface {
  private readonly rdfjsStore: ImportCommitTarget;

  public constructor(options: BufferedRdfjsQuadStoreOptions) {
    this.rdfjsStore = options.rdfjsStore;
  }

  public async import(request: ImportRequest): Promise<void> {
    await importViaBufferedRdfjsStore(request, {
      rdfjsStore: this.rdfjsStore,
    });
  }

  public async export(request: ExportRequest): Promise<ExportResponse> {
    return await exportFromRdfjsStore(this.rdfjsStore, request);
  }
}
