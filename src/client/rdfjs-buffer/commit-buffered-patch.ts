import type {
  CommitHandler,
  PatchCommitContext,
} from "@/client/quad-store/mod.ts";
import type { RdfjsPatchBuffer } from "./rdfjs-patch-buffer.ts";

/**
 * CommitBufferedPatchOptions configures a shared buffered patch flush.
 */
export interface CommitBufferedPatchOptions {
  /** commit persists the deduplicated patch. */
  commit?: CommitHandler;

  /** context carries optional import mode metadata for commit handlers. */
  context?: PatchCommitContext;

  /** fallbackCommit runs when commit is omitted. */
  fallbackCommit?: CommitHandler;
}

export async function commitBufferedPatch(
  patchBuffer: RdfjsPatchBuffer,
  options: CommitBufferedPatchOptions,
): Promise<void> {
  await patchBuffer.flushBuffer(
    options.commit,
    options.context,
    options.fallbackCommit,
  );
}
