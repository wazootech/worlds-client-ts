import type * as rdfjs from "@rdfjs/types";
import { Readable } from "node:stream";
import { Parser, Writer } from "n3";
import type {
  ExportRequest,
  ExportResponse,
  ImportRequest,
  ImportResponse,
  QuadStoreInterface,
} from "../../quad-store/mod.ts";

/**
 * RdfjsQuadStore is the standard implementation of the QuadStoreInterface that uses
 * an underlying in-memory or compatible RDFJS Store.
 */
export class RdfjsQuadStore implements QuadStoreInterface {
  constructor(private readonly store: rdfjs.Store) {}

  public async import(request: ImportRequest): Promise<ImportResponse> {
    const mode = request.mode ?? "merge";
    const quads = await materializeImportQuads(request.source);

    if (mode === "replace") {
      await new Promise<void>((resolve, reject) => {
        const removalStream = this.store.removeMatches(null, null, null, null);
        removalStream.on("end", resolve);
        removalStream.on("error", reject);
      });
    }

    for (const quad of quads) {
      // deno-lint-ignore no-explicit-any
      (this.store as any).addQuad(quad);
    }
  }

  public async export(request: ExportRequest): Promise<ExportResponse> {
    const stream = this.store.match(null, null, null, null);
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
}

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

export function parseQuads(
  data: string,
  contentType?: string,
): rdfjs.Stream<rdfjs.Quad> {
  const { n3Format } = getFormat(contentType);
  const parser = new Parser({ format: n3Format });
  const quads = parser.parse(data);
  return Readable.from(quads) as unknown as rdfjs.Stream<rdfjs.Quad>;
}

async function materializeImportQuads(
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
    const quads: rdfjs.Quad[] = [];
    await new Promise<void>((resolve, reject) => {
      parsedStream.on("data", (quad: rdfjs.Quad) => quads.push(quad));
      parsedStream.on("end", resolve);
      parsedStream.on("error", reject);
    });
    return quads;
  }

  throw new Error("Unsupported import source kind");
}
