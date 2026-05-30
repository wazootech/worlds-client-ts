import type * as rdfjs from "@rdfjs/types";
import { Writer } from "n3";
import type { ExportRequest, ExportResponse } from "./quad-store-interface.ts";
import { getFormat } from "./rdf-formats.ts";

/**
 * collectQuadsFromStream drains an RDF/JS quad stream into an array.
 */
export function collectQuadsFromStream(
  stream: rdfjs.Stream<rdfjs.Quad>,
): Promise<rdfjs.Quad[]> {
  const quads: rdfjs.Quad[] = [];
  return new Promise<rdfjs.Quad[]>((resolve, reject) => {
    stream.on("data", (quad: rdfjs.Quad) => quads.push(quad));
    stream.on("end", () => resolve(quads));
    stream.on("error", reject);
  });
}

/**
 * exportQuadsResponse formats collected quads according to an export request.
 */
export async function exportQuadsResponse(
  quads: rdfjs.Quad[],
  request: ExportRequest,
): Promise<ExportResponse> {
  if (request.format.kind === "quads") {
    return { kind: "quads", quads };
  }

  if (request.format.kind === "serialized") {
    const contentType = request.format.contentType ?? "application/n-quads";
    const { n3Format } = getFormat(contentType);

    const writer = new Writer({ format: n3Format });
    for (const quad of quads) {
      writer.addQuad(quad);
    }

    const data = await new Promise<string>((resolve, reject) => {
      writer.end((error: Error | null, result?: string) => {
        if (error) reject(error);
        else resolve(result ?? "");
      });
    });

    return { kind: "serialized", data, contentType };
  }

  throw new Error("Invalid format requested");
}

/**
 * awaitDrainRemoveMatches waits for removeMatches(null, null, null, null) to finish.
 * Durable Deno KV replace imports use PatchCommitContext.importMode instead.
 */
export function awaitDrainRemoveMatches(
  store: rdfjs.Store,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const removalStream = store.removeMatches(null, null, null, null);
    removalStream.on("end", resolve);
    removalStream.on("error", reject);
  });
}
