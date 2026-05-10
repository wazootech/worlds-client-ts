import type * as rdfjs from "@rdfjs/types";
import { Readable } from "node:stream";
import { Parser } from "n3";
import { getFormat } from "./formats.ts";

/**
 * ImportMode is the type of import to perform.
 * merge: Merge the import into the store.
 * replace: Replace the store with the import.
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
    // Note: store.removeMatches is also streaming/async in standard RDF.js
    // But some stores like N3 offer it synchronously. We promise-ify the import stream below.
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

  // Await the store.import to complete before resolving
  return await new Promise<void>((resolve, reject) => {
    const res = store.import(stream);
    res.on("end", resolve);
    res.on("error", reject);
  });
}
