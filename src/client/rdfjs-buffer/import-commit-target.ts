import type * as rdfjs from "@rdfjs/types";
import type { ImportCommitTarget } from "./import-export-via-rdfjs-store.ts";
import type { PatchCommitContext } from "@/client/quad-store/mod.ts";
import type { ImportLifecycle } from "@/client/import-lifecycle/mod.ts";
import { createRdfjsStoreCommitHandler } from "./apply-rdfjs-patch-to-store.ts";
import { commitBufferedPatch } from "./commit-buffered-patch.ts";
import { RdfjsPatchBuffer } from "./rdfjs-patch-buffer.ts";

/**
 * ImportCommitTargetOptions configures an in-memory ImportCommitTarget adapter.
 */
export interface ImportCommitTargetOptions {
  /** store is the underlying RDF/JS graph mutated on commit. */
  store: rdfjs.Store;

  /** importLifecycle runs around import commits when PatchCommitContext.importMode is set. */
  importLifecycle?: ImportLifecycle;
}

/**
 * createImportCommitTarget buffers import quads until commit, matching durable import ordering.
 */
export function createImportCommitTarget(
  options: ImportCommitTargetOptions,
): ImportCommitTarget {
  const patchBuffer = new RdfjsPatchBuffer();
  const commitHandler = createRdfjsStoreCommitHandler(options.store);

  return {
    addQuad(quad: rdfjs.Quad): void {
      patchBuffer.addQuad(quad);
    },

    match(
      subject?: rdfjs.Term | null,
      predicate?: rdfjs.Term | null,
      object?: rdfjs.Term | null,
      graph?: rdfjs.Term | null,
    ): rdfjs.Stream<rdfjs.Quad> {
      return options.store.match(subject, predicate, object, graph);
    },

    async commit(context?: PatchCommitContext): Promise<void> {
      await commitBufferedPatch(patchBuffer, {
        commitHandler,
        context,
        importLifecycle: options.importLifecycle,
      });
    },
  };
}
