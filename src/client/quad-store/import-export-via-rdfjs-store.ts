import type * as rdfjs from "@rdfjs/types";
import type { PatchCommitContext } from "./commit-handler.ts";
import type {
  ExportRequest,
  ExportResponse,
  ImportRequest,
} from "./quad-store-interface.ts";
import {
  type ImportLifecycle,
  runImportWithLifecycle,
} from "@/client/commit-sync/mod.ts";
import {
  collectQuadsFromStream,
  exportQuadsResponse,
  materializeImportQuads,
} from "./rdf-formats.ts";

/**
 * CommittingRdfjsStore is the minimal surface needed for durable buffered import and export.
 */
export interface CommittingRdfjsStore {
  /** addQuad buffers a quad until commit. */
  addQuad(quad: rdfjs.Quad): void;

  /** match streams quads for a pattern (used by export). */
  match(
    subject?: rdfjs.Term | null,
    predicate?: rdfjs.Term | null,
    object?: rdfjs.Term | null,
    graph?: rdfjs.Term | null,
  ): rdfjs.Stream<rdfjs.Quad>;

  /** commit persists buffered mutations to durable storage. */
  commit(context?: PatchCommitContext): Promise<void>;
}

/**
 * ImportViaBufferedRdfjsStoreOptions configures durable import over a committing rdfjs.Store.
 */
export interface ImportViaBufferedRdfjsStoreOptions {
  /** rdfjsStore receives buffered quads and persists on commit. */
  rdfjsStore: CommittingRdfjsStore;
}

/**
 * importViaBufferedRdfjsStore materializes import quads, buffers them on rdfjsStore, and commits once.
 */
export async function importViaBufferedRdfjsStore(
  request: ImportRequest,
  importLifecycle: ImportLifecycle,
  options: ImportViaBufferedRdfjsStoreOptions,
): Promise<void> {
  await runImportWithLifecycle(importLifecycle, async () => {
    const mode = request.mode ?? "merge";
    const quads = await materializeImportQuads(request.source);

    for (const quad of quads) {
      options.rdfjsStore.addQuad(quad);
    }

    await options.rdfjsStore.commit({ importMode: mode });
  });
}

/**
 * exportFromRdfjsStore streams all quads from an RDF/JS store and serializes the export response.
 */
export async function exportFromRdfjsStore(
  rdfjsStore: rdfjs.Store,
  request: ExportRequest,
): Promise<ExportResponse> {
  const stream = rdfjsStore.match(null, null, null, null);
  const quads = await collectQuadsFromStream(stream);
  return await exportQuadsResponse(quads, request);
}
