import type * as rdfjs from "@rdfjs/types";
import { Readable } from "node:stream";
import { Parser, Writer } from "n3";
import type {
  ExportRequest,
  ExportResponse,
  ImportRequest,
} from "./quad-store-interface.ts";

/**
 * RdfFormat specifies content type configuration mapping for parser/writer facilities.
 */
export interface RdfFormat {
  contentType: string;
  n3Format: string;
}

/**
 * FORMATS is a map of content types to supported RdfFormats.
 */
export const FORMATS: Record<string, RdfFormat> = {
  "text/turtle": { contentType: "text/turtle", n3Format: "Turtle" },
  "application/n-quads": {
    contentType: "application/n-quads",
    n3Format: "N-Quads",
  },
  "application/n-triples": {
    contentType: "application/n-triples",
    n3Format: "N-Triples",
  },
  "text/n3": { contentType: "text/n3", n3Format: "N3" },
};

/**
 * getFormat resolves the appropriate RdfFormat mapping for the given content type, defaulting to N-Quads.
 */
export function getFormat(contentType: string | undefined): RdfFormat {
  const format = contentType?.toLowerCase() || "application/n-quads";
  return FORMATS[format] || FORMATS["application/n-quads"];
}

/**
 * parseQuads parses serialized RDF into a quad stream for the given content type.
 */
export function parseQuads(
  data: string,
  contentType?: string,
): rdfjs.Stream<rdfjs.Quad> {
  const { n3Format } = getFormat(contentType);
  const parser = new Parser({ format: n3Format });
  const quads = parser.parse(data);
  return Readable.from(quads) as unknown as rdfjs.Stream<rdfjs.Quad>;
}

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
 * materializeImportQuads collects quads from an import source into an array.
 */
export async function materializeImportQuads(
  source: ImportRequest["source"],
): Promise<rdfjs.Quad[]> {
  if (source.kind === "quads") {
    return Array.from(source.quads);
  }

  if (source.kind === "dataset") {
    return Array.from(source.dataset);
  }

  if (source.kind === "serialized") {
    const parsedStream = parseQuads(source.data, source.contentType);
    return await collectQuadsFromStream(parsedStream);
  }

  throw new Error("Unsupported import source kind");
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
 * Used by in-memory replace import commits; durable backends honor PatchCommitContext.importMode in persistPatch.
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
