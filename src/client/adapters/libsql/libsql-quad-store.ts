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
import { runImportWithLifecycle } from "@/client/quad-store/mod.ts";
import type { LibsqlRdfjsStore } from "./libsql-rdfjs-store.ts";

/**
 * LibsqlQuadStoreOptions configures LibsqlQuadStore dependencies.
 */
export interface LibsqlQuadStoreOptions {
  /** libsqlRdfjsStore is the hexastore-backed RDF/JS store receiving buffered mutations. */
  libsqlRdfjsStore: LibsqlRdfjsStore;

  /** importLifecycle coordinates deferred search indexing around import commits. */
  importLifecycle: ImportLifecycle;
}

/**
 * LibsqlQuadStore implements QuadStoreInterface over LibsqlRdfjsStore with LibSQL import lifecycle orchestration.
 */
export class LibsqlQuadStore implements QuadStoreInterface {
  public constructor(
    private readonly options: LibsqlQuadStoreOptions,
  ) {}

  public async import(request: ImportRequest): Promise<void> {
    await runImportWithLifecycle(
      this.options.importLifecycle,
      async () => {
        const mode = request.mode ?? "merge";
        const quads = await materializeImportQuads(request.source);

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
      },
    );
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
