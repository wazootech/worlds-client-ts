import type * as rdfjs from "@rdfjs/types";

/**
 * Patch is a batch of quad-level store changes.
 */
export interface Patch {
  /**
   * insertions are the quads that were added to the store.
   */
  insertions: rdfjs.Quad[];

  /**
   * deletions are the quads that were removed from the store.
   */
  deletions: rdfjs.Quad[];
}

/**
 * PatchHandler processes asynchronous batches of patches.
 * Ideal for offloading to search indexes or external sync sinks.
 */
export interface PatchHandler {
  /**
   * patch processes a list of patches.
   */
  patch(patches: Patch[]): Promise<void>;
}
