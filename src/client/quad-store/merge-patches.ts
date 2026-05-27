import type { Patch } from "./patch.ts";

/**
 * mergePatches concatenates multiple patch batches into a single patch without deduplication.
 */
export function mergePatches(patches: Patch[]): Patch {
  if (patches.length === 0) {
    return { insertions: [], deletions: [] };
  }

  return {
    insertions: patches.flatMap((patch) => patch.insertions),
    deletions: patches.flatMap((patch) => patch.deletions),
  };
}
