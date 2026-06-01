import { BufferedRdfjsQuadStore } from "@/client/rdfjs-buffer/mod.ts";

import type { DenokvRdfjsStore } from "../rdfjs-store/mod.ts";

/**
 * DenokvQuadStoreOptions configures DenokvQuadStore dependencies.
 */
export interface DenokvQuadStoreOptions {
  /** denokvRdfjsStore is the hexastore-backed RDF/JS store receiving buffered mutations. */
  denokvRdfjsStore: DenokvRdfjsStore;
}

/**
 * DenokvQuadStore implements QuadStoreInterface over DenokvRdfjsStore.
 */
export class DenokvQuadStore extends BufferedRdfjsQuadStore {
  public constructor(options: DenokvQuadStoreOptions) {
    super({ rdfjsStore: options.denokvRdfjsStore });
  }
}
