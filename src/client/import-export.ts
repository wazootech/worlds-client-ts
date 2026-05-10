import type * as rdfjs from "@rdfjs/types";
import { Readable } from "node:stream";
import { Parser, Writer } from "n3";

/**
 * RdfFormat is a type that represents the content type and n3Format for a given format.
 */
export interface RdfFormat {
  contentType: string;
  n3Format: string;
}

/**
 * FORMATS is a map of content types to RdfFormats.
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
 * getFormat returns the RdfFormat for a given content type.
 */
export function getFormat(contentType: string | undefined): RdfFormat {
  const format = contentType?.toLowerCase() || "application/n-quads";
  return FORMATS[format] || FORMATS["application/n-quads"];
}

/**
 * ImportMode is the type of import to perform.
 */
export type ImportMode = "merge" | "replace";

/** What data are we importing? */
export type ImportSource =
  | { kind: "quads"; quads: Iterable<rdfjs.Quad> }
  | { kind: "dataset"; dataset: rdfjs.DatasetCore }
  | { kind: "serialized"; data: string; contentType?: string };

export interface ImportRequest {
  /** mode of import (defaults to "merge") */
  mode?: ImportMode;

  /** source of data */
  source: ImportSource;
}

/**
 * ImportResponse is the response from an import operation.
 */
export type ImportResponse = void;

function parseQuads(
  data: string,
  contentType?: string,
): rdfjs.Stream<rdfjs.Quad> {
  const { n3Format } = getFormat(contentType);
  const parser = new Parser({ format: n3Format });
  const quads = parser.parse(data);
  return Readable.from(quads) as unknown as rdfjs.Stream<rdfjs.Quad>;
}

/**
 * executeImport applies an import request to a store.
 */
export async function executeImport(
  store: rdfjs.Store,
  request: ImportRequest,
): Promise<ImportResponse> {
  const mode = request.mode ?? "merge";
  if (mode === "replace") {
    store.removeMatches(null, null, null, null);
  }

  let stream: rdfjs.Stream<rdfjs.Quad>;
  if (request.source.kind === "quads") {
    stream = Readable.from(request.source.quads) as unknown as rdfjs.Stream<
      rdfjs.Quad
    >;
  } else if (request.source.kind === "dataset") {
    stream = Readable.from(request.source.dataset) as unknown as rdfjs.Stream<
      rdfjs.Quad
    >;
  } else if (request.source.kind === "serialized") {
    stream = parseQuads(request.source.data, request.source.contentType);
  } else {
    throw new Error("Unsupported import source kind");
  }

  return await new Promise<void>((resolve, reject) => {
    const res = store.import(stream);
    res.on("end", resolve);
    res.on("error", reject);
  });
}

/**
 * ExportRequest is the request type for the export function.
 */
export interface ExportRequest {
  /** Desired output format. */
  format:
    | { kind: "quads" }
    | { kind: "serialized"; contentType?: string };
}

/**
 * ExportResponse is the response type for the export function.
 */
export type ExportResponse =
  | { kind: "quads"; quads: rdfjs.Quad[] }
  | { kind: "serialized"; data: string; contentType: string };

/**
 * executeExport extracts all quads from the store in requested shape.
 */
export async function executeExport(
  store: rdfjs.Store,
  request: ExportRequest,
): Promise<ExportResponse> {
  const stream = store.match(null, null, null, null);
  const quads: rdfjs.Quad[] = [];

  await new Promise<void>((resolve, reject) => {
    stream.on("data", (q: rdfjs.Quad) => quads.push(q));
    stream.on("end", resolve);
    stream.on("error", reject);
  });

  if (request.format.kind === "quads") {
    return { kind: "quads", quads };
  }

  if (request.format.kind === "serialized") {
    const contentType = request.format.contentType ?? "application/n-quads";
    const { n3Format } = getFormat(contentType);

    const writer = new Writer({ format: n3Format });
    for (const q of quads) {
      writer.addQuad(q);
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
