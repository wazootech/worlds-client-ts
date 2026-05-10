import type * as rdfjs from "@rdfjs/types";
import { Writer } from "n3";
import { getFormat } from "./formats.ts";

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
