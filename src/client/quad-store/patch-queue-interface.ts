import type { Patch } from "./patch.ts";

/**
 * PatchQueueInterface defines the buffering interface for cumulative transaction patches.
 */
export interface PatchQueueInterface {
  /** push stages a delta transaction to the active monitoring queue. */
  push(patch: Patch): void;

  /** flush purges the cumulative staging cache and returns its current contents. */
  flush(): Patch[];
}
