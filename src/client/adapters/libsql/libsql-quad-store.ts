import type {
  ExportRequest,
  ExportResponse,
  ImportLifecycle,
  ImportRequest,
  QuadStoreInterface,
} from "@/client/quad-store/mod.ts";
import {
  awaitDrainRemoveMatches,
  collectQuadsFromStream,
  exportQuadsResponse,
} from "@/client/quad-store/mod.ts";
import { materializeImportQuads } from "@/client/quad-store/rdf-formats.ts";
import { runImportWithLifecycle } from "@/client/quad-store/mod.ts";
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
    await runImportWithLifecycle(
      this.options.importLifecycle,
      async () => {
        const mode = request.mode ?? "merge";
        const quads = await materializeImportQuads(request.source);

        if (mode === "replace") {
          await awaitDrainRemoveMatches(this.options.libsqlRdfjsStore);
        }

        for (const quad of quads) {
          this.options.libsqlRdfjsStore.addQuad(quad);
        }

        await this.options.libsqlRdfjsStore.commit();
      },
    );
  }

  public async export(request: ExportRequest): Promise<ExportResponse> {
    const stream = this.options.libsqlRdfjsStore.match(null, null, null, null);
    const quads = await collectQuadsFromStream(stream);
    return await exportQuadsResponse(quads, request);
  }
}
