import type * as rdfjs from "@rdfjs/types";

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

  /**
   * deferSearchIndex on LibSQL clients persists quads during import, then rebuilds FTS/vector chunks once.
   * Use for large bulk loads (single `quads` array + one `import`); normal writes should omit this flag.
   */
  deferSearchIndex?: boolean;
}

/**
 * ImportResponse is the response from an import operation.
 */
export type ImportResponse = void;

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
 * QuadStoreInterface defines the core capabilities for ingesting and venting
 * graph data out of the system.
 */
export interface QuadStoreInterface {
  /**
   * import merges or replaces the underlying store with provided RDF source data.
   *
   * @param request The payload defining the ingestion source and overwrite mode.
   */
  import(request: ImportRequest): Promise<ImportResponse>;

  /**
   * export extracts the graph contents in raw quads or serialized formats.
   *
   * @param request The desired format specifications.
   */
  export(request: ExportRequest): Promise<ExportResponse>;
}
