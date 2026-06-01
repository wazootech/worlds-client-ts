import { BufferedRdfjsQuadStore } from "@/client/rdfjs-buffer/mod.ts";

import type { LibsqlRdfjsStore } from "../rdfjs-store/mod.ts";

/**
 * LibsqlQuadStoreOptions configures LibsqlQuadStore dependencies.
 */
export interface LibsqlQuadStoreOptions {
  /** libsqlRdfjsStore is the hexastore-backed RDF/JS store receiving buffered mutations. */
  libsqlRdfjsStore: LibsqlRdfjsStore;
}

/**
 * LibsqlQuadStore implements QuadStoreInterface over LibsqlRdfjsStore.
 */
export class LibsqlQuadStore extends BufferedRdfjsQuadStore {
  public constructor(options: LibsqlQuadStoreOptions) {
    super({ rdfjsStore: options.libsqlRdfjsStore });
  }
}
