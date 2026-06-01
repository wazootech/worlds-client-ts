import {
  BufferedRdfjsQuadStore,
  createBufferedQuadTransaction,
} from "@/client/rdfjs-buffer/mod.ts";
import type { CommitHandler } from "@/client/quad-store/mod.ts";
import type { ImportLifecycle } from "@/client/import-lifecycle/mod.ts";

import type { LibsqlRdfjsStore } from "../rdfjs-store/mod.ts";

/**
 * LibsqlQuadStoreOptions configures LibsqlQuadStore dependencies.
 */
export interface LibsqlQuadStoreOptions {
  /** libsqlRdfjsStore is the stateless hexastore-backed RDF/JS read source. */
  libsqlRdfjsStore: LibsqlRdfjsStore;

  /** commitHandler atomically persists buffered patches on commit(). */
  commitHandler: CommitHandler;

  /** importLifecycle runs around import commits when PatchCommitContext.importMode is set. */
  importLifecycle: ImportLifecycle;
}

/**
 * LibsqlQuadStore implements QuadStoreInterface over LibsqlRdfjsStore.
 */
export class LibsqlQuadStore extends BufferedRdfjsQuadStore {
  public constructor(options: LibsqlQuadStoreOptions) {
    super({
      readSource: options.libsqlRdfjsStore,
      transactionFactory: () =>
        createBufferedQuadTransaction({
          commitHandler: options.commitHandler,
          importLifecycle: options.importLifecycle,
        }),
    });
  }
}
