import type {
  CommitHandler,
  PatchCommitContext,
} from "@/client/quad-store/mod.ts";
import type { RdfjsPatchBuffer } from "./rdfjs-patch-buffer.ts";

/**
 * CommitBufferedPatchOptions configures a shared buffered patch flush.
 */
export interface CommitBufferedPatchOptions {
  /** commitHandler persists the deduplicated patch. */
  commitHandler?: CommitHandler;

  /** context carries optional import mode metadata for commit handlers. */
  context?: PatchCommitContext;

  /** fallbackCommitHandler runs when commitHandler is omitted. */
  fallbackCommitHandler?: CommitHandler;
}

export async function commitBufferedPatch(
  patchBuffer: RdfjsPatchBuffer,
  options: CommitBufferedPatchOptions,
): Promise<void> {
  await patchBuffer.flushBuffer(
    options.commitHandler,
    options.context,
    options.fallbackCommitHandler,
  );
}
