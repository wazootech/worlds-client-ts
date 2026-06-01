import type * as rdfjs from "@rdfjs/types";
import type {
  ExportRequest,
  ExportResponse,
  ImportRequest,
  QuadStoreInterface,
} from "@/client/quad-store/mod.ts";
import {
  createRdfjsStoreCommitHandler,
  createTransaction,
  exportFromRdfjsStore,
  importViaBufferedRdfjsStore,
} from "@/client/rdfjs-buffer/mod.ts";
import * as N3 from "n3";

/**
 * RdfjsQuadStoreOptions configures RdfjsQuadStore dependencies.
 */
export interface RdfjsQuadStoreOptions {
  /** store is the active in-memory quad backend. */
  store?: rdfjs.Store;
}

/**
 * RdfjsQuadStore is the standard implementation of the QuadStoreInterface that uses
 * an underlying in-memory or compatible RDFJS Store.
 */
export class RdfjsQuadStore implements QuadStoreInterface {
  private readonly store: rdfjs.Store;

  public constructor(options?: RdfjsQuadStoreOptions) {
    this.store = options?.store ?? new N3.Store();
  }

  public async import(request: ImportRequest): Promise<void> {
    const commitHandler = createRdfjsStoreCommitHandler(this.store);
    await importViaBufferedRdfjsStore(request, {
      createTransaction: () =>
        createTransaction({
          commit: commitHandler,
        }),
    });
  }

  public async export(request: ExportRequest): Promise<ExportResponse> {
    return await exportFromRdfjsStore(this.store, request);
  }
}
