import type * as rdfjs from "@rdfjs/types";
import { Readable } from "node:stream";
import { Parser, Writer } from "n3";
import type {
  ExportRequest,
  ExportResponse,
  ImportRequest,
  ImportResponse,
  QuadStoreInterface,
} from "./interface.ts";

import type { Patch, PatchHandler } from "./patch.ts";

/**
 * RdfjsQuadStore is the standard implementation of the QuadStoreInterface that uses
 * an underlying in-memory or compatible RDFJS Store.
 *
 * It optionally emits transaction-scoped Patch notifications to attached handlers upon successfully completed imports.
 */
export class RdfjsQuadStore implements QuadStoreInterface {
  constructor(
    private readonly store: rdfjs.Store,
    private readonly handlers: PatchHandler[] = [],
  ) {}

  public async import(request: ImportRequest): Promise<ImportResponse> {
    const mode = request.mode ?? "merge";
    const deletions: rdfjs.Quad[] = [];
    const insertions: rdfjs.Quad[] = [];

    // 1. Prepare replacement tracker if we are performing a total swap
    if (mode === "replace") {
      const exportRes = await this.export({ format: { kind: "quads" } });
      if (exportRes.kind === "quads") {
        deletions.push(...exportRes.quads);
      }
      this.store.removeMatches(null, null, null, null);
    }

    // 2. Derive foundational stream from the ingestion source payloads
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

    // 3. Tap the streaming runtime to accumulate insertion vector without copying buffers
    stream.on("data", (q: rdfjs.Quad) => {
      insertions.push(q);
    });

    // 4. Execute inner commit to store
    await new Promise<void>((resolve, reject) => {
      const res = this.store.import(stream);
      res.on("end", resolve);
      res.on("error", reject);
    });

    // 5. Synchronize external listeners seamlessly upon confirmed commit
    if (this.handlers.length > 0 && (insertions.length > 0 || deletions.length > 0)) {
      const patch: Patch = { insertions, deletions };
      await Promise.all(this.handlers.map((h) => h.patch([patch])));
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

function parseQuads(
  data: string,
  contentType?: string,
): rdfjs.Stream<rdfjs.Quad> {
  const { n3Format } = getFormat(contentType);
  const parser = new Parser({ format: n3Format });
  const quads = parser.parse(data);
  return Readable.from(quads) as unknown as rdfjs.Stream<rdfjs.Quad>;
}
