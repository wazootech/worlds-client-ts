import type * as rdfjs from "@rdfjs/types";
import { Readable } from "node:stream";
import { Parser } from "n3";
import type { ImportRequest } from "./quad-store-interface.ts";
import { collectQuadsFromStream } from "./quad-stream.ts";

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
