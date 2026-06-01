import {
  exportFromRdfjsStore,
  type ExportRequest,
  type ExportResponse,
  type ImportRequest,
  importViaBufferedRdfjsStore,
  type QuadStoreInterface,
} from "@/client/quad-store/mod.ts";
import type { LibsqlRdfjsStore } from "../rdfjs-store/mod.ts";

/**
 * LibsqlQuadStoreOptions configures LibsqlQuadStore dependencies.
 */
export interface LibsqlQuadStoreOptions {
  /** libsqlRdfjsStore is the hexastore-backed RDF/JS store receiving buffered mutations. */
  libsqlRdfjsStore: LibsqlRdfjsStore;
}

/**
 * LibsqlQuadStore implements QuadStoreInterface over LibsqlRdfjsStore.
 */
export class LibsqlQuadStore implements QuadStoreInterface {
  public constructor(
    private readonly options: LibsqlQuadStoreOptions,
  ) {}

  public async import(request: ImportRequest): Promise<void> {
    await importViaBufferedRdfjsStore(request, {
      rdfjsStore: this.options.libsqlRdfjsStore,
    });
  }

  public async export(request: ExportRequest): Promise<ExportResponse> {
    return await exportFromRdfjsStore(
      this.options.libsqlRdfjsStore,
      request,
    );
  }
}
