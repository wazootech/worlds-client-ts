import type {
  ExportRequest,
  ExportResponse,
  ImportLifecycle,
  ImportRequest,
  PatchCommitContext,
  QuadStoreInterface,
} from "@/client/quad-store/mod.ts";
import {
  collectQuadsFromStream,
  exportQuadsResponse,
} from "@/client/quad-store/mod.ts";
import { materializeImportQuads } from "@/client/quad-store/rdf-formats.ts";
import { runImportWithLifecycle } from "@/client/quad-store/mod.ts";

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
    await runImportWithLifecycle(
      this.options.importLifecycle,
      async () => {
        const mode = request.mode ?? "merge";
        const quads = await materializeImportQuads(request.source);
        const commitContext: PatchCommitContext = { importMode: mode };

        for (const quad of quads) {
          this.options.denokvRdfjsStore.addQuad(quad);
        }

        await this.options.denokvRdfjsStore.commit(commitContext);
      },
    );
  }

  public async export(request: ExportRequest): Promise<ExportResponse> {
    const stream = this.options.denokvRdfjsStore.match(null, null, null, null);
    const quads = await collectQuadsFromStream(stream);
    return await exportQuadsResponse(quads, request);
  }
}
