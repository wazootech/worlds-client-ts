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
 * PatchListener describes a functional sink that accepts a batch of store changes asynchronously.
 */
export type PatchListener = (patch: Patch) => Promise<void> | void;

/**
 * PatchQueueInterface defines the buffering interface for cumulative transaction patches.
 */
export interface PatchQueueInterface {
  /** push stages a delta transaction to the active monitoring queue. */
  push(patch: Patch): void;

  /** flush purges the cumulative staging cache and returns its current contents. */
  flush(): Patch[];
}
