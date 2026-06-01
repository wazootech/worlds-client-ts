import {
  BufferedRdfjsQuadStore,
  createBufferedQuadTransaction,
} from "@/client/rdfjs-buffer/mod.ts";
import type { CommitHandler } from "@/client/quad-store/mod.ts";
import type { ImportLifecycle } from "@/client/import-lifecycle/mod.ts";
import type * as rdfjs from "@rdfjs/types";

import type { DenokvRdfjsStore } from "../rdfjs-store/mod.ts";

/**
 * DenokvQuadStoreOptions configures DenokvQuadStore dependencies.
 */
export interface DenokvQuadStoreOptions {
  /** denokvRdfjsStore is the stateless hexastore-backed RDF/JS read source. */
  denokvRdfjsStore: DenokvRdfjsStore;

  /** commitHandler atomically persists buffered patches on commit(). */
  commitHandler: CommitHandler;

  /** importLifecycle runs around import commits when PatchCommitContext.importMode is set. */
  importLifecycle: ImportLifecycle;
}

/**
 * DenokvQuadStore implements QuadStoreInterface over DenokvRdfjsStore.
 */
export class DenokvQuadStore extends BufferedRdfjsQuadStore {
  public constructor(options: DenokvQuadStoreOptions) {
    super({
      readSource: options.denokvRdfjsStore as unknown as rdfjs.Store,
      transactionFactory: () =>
        createBufferedQuadTransaction({
          commitHandler: options.commitHandler,
          importLifecycle: options.importLifecycle,
        }),
    });
  }
}
