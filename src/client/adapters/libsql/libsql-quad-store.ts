import {
  exportFromRdfjsStore,
  type ExportRequest,
  type ExportResponse,
  type ImportRequest,
  importViaBufferedRdfjsStore,
  type QuadStoreInterface,
} from "@/client/quad-store/mod.ts";
import type { ImportLifecycle } from "@/client/commit-sync/mod.ts";
import type { LibsqlRdfjsStore } from "./libsql-rdfjs-store.ts";

/**
 * LibsqlQuadStoreOptions configures LibsqlQuadStore dependencies.
 */
export interface LibsqlQuadStoreOptions {
  /** libsqlRdfjsStore is the hexastore-backed RDF/JS store receiving buffered mutations. */
  libsqlRdfjsStore: LibsqlRdfjsStore;

  /** importLifecycle coordinates deferred search indexing around import commits. */
  importLifecycle: ImportLifecycle;
}

/**
 * LibsqlQuadStore implements QuadStoreInterface over LibsqlRdfjsStore with LibSQL import lifecycle orchestration.
 */
export class LibsqlQuadStore implements QuadStoreInterface {
  public constructor(
    private readonly options: LibsqlQuadStoreOptions,
  ) {}

  public async import(request: ImportRequest): Promise<void> {
    await importViaBufferedRdfjsStore(
      request,
      this.options.importLifecycle,
      {
        rdfjsStore: this.options.libsqlRdfjsStore,
      },
    );
  }

  public async export(request: ExportRequest): Promise<ExportResponse> {
    return await exportFromRdfjsStore(
      this.options.libsqlRdfjsStore,
      request,
    );
  }
}
