import type * as rdfjs from "@rdfjs/types";
import type {
  CommitHandler,
  PatchCommitContext,
} from "@/client/quad-store/mod.ts";
import { commitBufferedPatch } from "./commit-buffered-patch.ts";
import { RdfjsPatchBuffer } from "./rdfjs-patch-buffer.ts";

/**
 * QuadTransaction represents a transactional staging area for quad mutations.
 */
export interface QuadTransaction {
  /** addQuad buffers a quad for insertion on commit. */
  addQuad(quad: rdfjs.Quad): void;

  /** removeQuad buffers a quad for deletion on commit. */
  removeQuad(quad: rdfjs.Quad): void;

  /** commit persists all buffered mutations atomically. */
  commit(context?: PatchCommitContext): Promise<void>;

  /** rollback drops all uncommitted mutations safely. */
  rollback(): void;
}

/**
 * BufferedQuadTransactionOptions configures an in-memory QuadTransaction adapter.
 */
export interface BufferedQuadTransactionOptions {
  /** commit atomically persists buffered patches on commit(). */
  commit?: CommitHandler;

  /** fallbackCommit runs when commit is omitted on flush. */
  fallbackCommit?: CommitHandler;
}

/**
 * createBufferedQuadTransaction buffers quads until commit, exposing explicit transaction boundaries.
 */
export function createTransaction(
  options: BufferedQuadTransactionOptions,
): QuadTransaction {
  const patchBuffer = new RdfjsPatchBuffer();

  return {
    addQuad(quad: rdfjs.Quad): void {
      patchBuffer.addQuad(quad);
    },

    removeQuad(quad: rdfjs.Quad): void {
      patchBuffer.delete(quad);
    },

    async commit(context?: PatchCommitContext): Promise<void> {
      await commitBufferedPatch(patchBuffer, {
        commit: options.commit,
        fallbackCommit: options.fallbackCommit,
        context,
      });
    },

    rollback(): void {
      patchBuffer.clearBuffer();
    },
  };
}
