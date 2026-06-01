import type {
  CommitHandler,
  PatchCommitContext,
} from "@/client/quad-store/mod.ts";
import { isImportCommit } from "@/client/quad-store/mod.ts";
import type { ImportLifecycle } from "@/client/import-lifecycle/mod.ts";
import {
  noopImportLifecycle,
  runImportWithLifecycle,
} from "@/client/import-lifecycle/mod.ts";
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

  /** importLifecycle runs around import commits when context carries importMode. */
  importLifecycle?: ImportLifecycle;
}

/**
 * commitBufferedPatch deduplicates and flushes a patch buffer, invoking import lifecycle only for import commits.
 */
export async function commitBufferedPatch(
  patchBuffer: RdfjsPatchBuffer,
  options: CommitBufferedPatchOptions,
): Promise<void> {
  const flushBody = async () => {
    await patchBuffer.flushBuffer(
      options.commitHandler,
      options.context,
      options.fallbackCommitHandler,
    );
  };

  if (!isImportCommit(options.context)) {
    await flushBody();
    return;
  }

  await runImportWithLifecycle(
    options.importLifecycle ?? noopImportLifecycle,
    flushBody,
  );
}
