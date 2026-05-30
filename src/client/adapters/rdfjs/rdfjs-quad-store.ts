import type * as rdfjs from "@rdfjs/types";
import type {
  ExportRequest,
  ExportResponse,
  ImportLifecycle,
  ImportRequest,
  QuadStoreInterface,
} from "@/client/quad-store/mod.ts";
import {
  awaitDrainRemoveMatches,
  collectQuadsFromStream,
  exportQuadsResponse,
} from "@/client/quad-store/mod.ts";
import { materializeImportQuads } from "@/client/quad-store/rdf-formats.ts";
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
        await awaitDrainRemoveMatches(store);
      }

      for (const quad of quads) {
        // deno-lint-ignore no-explicit-any
        (store as any).addQuad(quad);
      }
    });
  }

  public async export(request: ExportRequest): Promise<ExportResponse> {
    const stream = this.store.match(null, null, null, null);
    const quads = await collectQuadsFromStream(stream);
    return await exportQuadsResponse(quads, request);
  }
}

function isRdfjsQuadStoreOptions(
  value: rdfjs.Store | RdfjsQuadStoreOptions,
): value is RdfjsQuadStoreOptions {
  return typeof value === "object" && value !== null && "store" in value;
}
