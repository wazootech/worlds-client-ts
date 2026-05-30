import type * as rdfjs from "@rdfjs/types";

import type { ImportMode } from "./quad-store-interface.ts";
import type { Patch } from "./patch.ts";

/**
 * PatchCommitContext carries optional metadata for a buffered commit flush.
 */
export interface PatchCommitContext {
  /** importMode signals bulk import replace semantics to durable commit handlers. */
  importMode?: ImportMode;
}

/**
 * CommitHandler atomically persists a patch of buffered insertions and deletions.
 */
export type CommitHandler = (
  patch: Patch,
  context?: PatchCommitContext,
) => Promise<void>;

/**
 * deduplicatePatchBuffers removes quads that appear in both insert and delete buffers.
 */
export function deduplicatePatchBuffers(
  insertBuffer: rdfjs.Quad[],
  deleteBuffer: rdfjs.Quad[],
): void {
  const removeFromInsert: number[] = [];
  for (
    let insertIndex = insertBuffer.length - 1;
    insertIndex >= 0;
    insertIndex--
  ) {
    for (
      let deleteIndex = deleteBuffer.length - 1;
      deleteIndex >= 0;
      deleteIndex--
    ) {
      if (insertBuffer[insertIndex].equals(deleteBuffer[deleteIndex])) {
        removeFromInsert.push(insertIndex);
        deleteBuffer.splice(deleteIndex, 1);
        break;
      }
    }
  }
  for (const insertIndex of removeFromInsert) {
    insertBuffer.splice(insertIndex, 1);
  }
}
