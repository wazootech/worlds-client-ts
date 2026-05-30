import type * as rdfjs from "@rdfjs/types";
import { Writer } from "n3";
import type {
  ExportRequest,
  ExportResponse,
  ImportLifecycle,
  ImportRequest,
  QuadStoreInterface,
} from "@/client/quad-store/mod.ts";
import {
  getFormat,
  materializeImportQuads,
} from "@/client/quad-store/rdf-formats.ts";
import {
  noopImportLifecycle,
  runImportWithLifecycle,
} from "@/client/quad-store/import-lifecycle.ts";

/**
 * RdfjsQuadStoreOptions configures RdfjsQuadStore dependencies.
 */
export interface RdfjsQuadStoreOptions {
  /** store is the underlying RDF/JS graph. */
  store: rdfjs.Store;

  /** importLifecycle runs before and after import (defaults to noop). */
  importLifecycle?: ImportLifecycle;
}

/**
 * RdfjsQuadStore is the standard implementation of the QuadStoreInterface that uses
 * an underlying in-memory or compatible RDFJS Store.
 */
export class RdfjsQuadStore implements QuadStoreInterface {
  private readonly store: rdfjs.Store;
  private readonly importLifecycle: ImportLifecycle;

  public constructor(store: rdfjs.Store);
  public constructor(options: RdfjsQuadStoreOptions);
  public constructor(
    storeOrOptions: rdfjs.Store | RdfjsQuadStoreOptions,
    importLifecycle?: ImportLifecycle,
  ) {
    if (isRdfjsQuadStoreOptions(storeOrOptions)) {
      this.store = storeOrOptions.store;
      this.importLifecycle = storeOrOptions.importLifecycle ??
        noopImportLifecycle;
    } else {
      this.store = storeOrOptions;
      this.importLifecycle = importLifecycle ?? noopImportLifecycle;
    }
  }

  public async import(request: ImportRequest): Promise<void> {
    await runImportWithLifecycle(this.importLifecycle, async () => {
      const mode = request.mode ?? "merge";
      const quads = await materializeImportQuads(request.source);
      const store = this.store;

      if (mode === "replace") {
        await new Promise<void>((resolve, reject) => {
          const removalStream = store.removeMatches(null, null, null, null);
          removalStream.on("end", resolve);
          removalStream.on("error", reject);
        });
      }

      for (const quad of quads) {
        // deno-lint-ignore no-explicit-any
        (store as any).addQuad(quad);
      }
    });
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

function isRdfjsQuadStoreOptions(
  value: rdfjs.Store | RdfjsQuadStoreOptions,
): value is RdfjsQuadStoreOptions {
  return typeof value === "object" && value !== null && "store" in value;
}
