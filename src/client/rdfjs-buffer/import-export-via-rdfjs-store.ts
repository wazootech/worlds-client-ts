import type * as rdfjs from "@rdfjs/types";
import type { PatchCommitContext } from "@/client/quad-store/commit-handler.ts";
import type {
  ExportRequest,
  ExportResponse,
  ImportRequest,
} from "@/client/quad-store/quad-store-interface.ts";
import {
  collectQuadsFromStream,
  exportQuadsResponse,
  materializeImportQuads,
} from "@/client/quad-store/rdf-formats.ts";

/**
 * ImportCommitTarget is the minimal surface needed for durable buffered import and export.
 */
export interface ImportCommitTarget {
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
  rdfjsStore: ImportCommitTarget;
}

/**
 * importViaBufferedRdfjsStore materializes import quads, buffers them on rdfjsStore, and commits once.
 */
export async function importViaBufferedRdfjsStore(
  request: ImportRequest,
  options: ImportViaBufferedRdfjsStoreOptions,
): Promise<void> {
  const mode = request.mode ?? "merge";
  const quads = await materializeImportQuads(request.source);

  for (const quad of quads) {
    options.rdfjsStore.addQuad(quad);
  }

  await options.rdfjsStore.commit({ importMode: mode });
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
