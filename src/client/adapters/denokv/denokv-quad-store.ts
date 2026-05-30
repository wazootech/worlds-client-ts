import type * as rdfjs from "@rdfjs/types";
import { Writer } from "n3";

import type {
  ExportRequest,
  ExportResponse,
  ImportLifecycle,
  ImportRequest,
  PatchCommitContext,
  QuadStoreInterface,
} from "@/client/quad-store/mod.ts";
import {
  getFormat,
  materializeImportQuads,
} from "@/client/quad-store/rdf-formats.ts";
import { runImportWithLifecycle } from "@/client/quad-store/mod.ts";

import type { DenokvRdfjsStore } from "./denokv-rdfjs-store.ts";

export type { SerializedQuad, SerializedTerm } from "./denokv-serialization.ts";
export { deserializeTerm } from "./denokv-serialization.ts";
export { MAX_KV_GET_MANY_SIZE } from "./denokv-rdfjs-store.ts";

/**
 * DenokvQuadStoreOptions configures DenokvQuadStore dependencies.
 */
export interface DenokvQuadStoreOptions {
  /** denokvRdfjsStore is the hexastore-backed RDF/JS store receiving buffered mutations. */
  denokvRdfjsStore: DenokvRdfjsStore;

  /** importLifecycle coordinates deferred external search indexing around import commits. */
  importLifecycle: ImportLifecycle;
}

/**
 * DenokvQuadStore implements QuadStoreInterface over DenokvRdfjsStore with Deno KV import lifecycle orchestration.
 */
export class DenokvQuadStore implements QuadStoreInterface {
  public constructor(
    private readonly options: DenokvQuadStoreOptions,
  ) {}

  public async import(request: ImportRequest): Promise<void> {
    await runImportWithLifecycle(
      this.options.importLifecycle,
      async () => {
        const mode = request.mode ?? "merge";
        const quads = await materializeImportQuads(request.source);
        const commitContext: PatchCommitContext = { importMode: mode };

        for (const quad of quads) {
          this.options.denokvRdfjsStore.addQuad(quad);
        }

        await this.options.denokvRdfjsStore.commit(commitContext);
      },
    );
  }

  public async export(request: ExportRequest): Promise<ExportResponse> {
    const stream = this.options.denokvRdfjsStore.match(null, null, null, null);
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

    throw new Error("Unsupported export format");
  }
}
