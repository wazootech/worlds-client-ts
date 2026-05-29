import type * as rdfjs from "@rdfjs/types";
import { Writer } from "n3";
import type {
  ExportRequest,
  ExportResponse,
  ImportRequest,
  QuadStoreInterface,
} from "@/client/quad-store/mod.ts";
import {
  getFormat,
  materializeImportQuads,
} from "@/client/quad-store/rdf-formats.ts";
import type { LibsqlPatchSyncState } from "@/client/adapters/libsql/sync/mod.ts";
import type { LibsqlRdfjsStore } from "./libsql-rdfjs-store.ts";

/**
 * LibsqlQuadStoreOptions configures LibsqlQuadStore dependencies.
 */
export interface LibsqlQuadStoreOptions {
  /** libsqlRdfjsStore is the hexastore-backed RDF/JS store receiving buffered mutations. */
  libsqlRdfjsStore: LibsqlRdfjsStore;

  /** patchSync coordinates deferred search indexing around import commits. */
  patchSync: LibsqlPatchSyncState;
}

/**
 * LibsqlQuadStore implements QuadStoreInterface over LibsqlRdfjsStore with LibSQL patch-sync orchestration.
 */
export class LibsqlQuadStore implements QuadStoreInterface {
  public constructor(
    private readonly options: LibsqlQuadStoreOptions,
  ) {}

  public async import(request: ImportRequest): Promise<void> {
    const mode = request.mode ?? "merge";
    const quads = await materializeImportQuads(request.source);

    this.options.patchSync.beforeImport();

    if (mode === "replace") {
      await new Promise<void>((resolve, reject) => {
        const removalStream = this.options.libsqlRdfjsStore.removeMatches(
          null,
          null,
          null,
          null,
        );
        removalStream.on("end", resolve);
        removalStream.on("error", reject);
      });
    }

    for (const quad of quads) {
      this.options.libsqlRdfjsStore.addQuad(quad);
    }

    await this.options.libsqlRdfjsStore.commit();
    await this.options.patchSync.afterImport();
  }

  public async export(request: ExportRequest): Promise<ExportResponse> {
    const stream = this.options.libsqlRdfjsStore.match(null, null, null, null);
    const quads: rdfjs.Quad[] = [];

    await new Promise<void>((resolve, reject) => {
      stream.on("data", (quad) => quads.push(quad));
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
}
