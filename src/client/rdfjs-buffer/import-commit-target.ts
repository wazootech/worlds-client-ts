import type * as rdfjs from "@rdfjs/types";
import type { ImportCommitTarget } from "./import-export-via-rdfjs-store.ts";
import type { PatchCommitContext } from "@/client/quad-store/mod.ts";
import { awaitDrainRemoveMatches } from "@/client/quad-store/mod.ts";

/**
 * ImportCommitTargetOptions configures an in-memory ImportCommitTarget adapter.
 */
export interface ImportCommitTargetOptions {
  /** store is the underlying RDF/JS graph mutated on commit. */
  store: rdfjs.Store;
}

/**
 * createImportCommitTarget buffers import quads until commit, matching durable import ordering.
 */
export function createImportCommitTarget(
  options: ImportCommitTargetOptions,
): ImportCommitTarget {
  const insertBuffer: rdfjs.Quad[] = [];

  return {
    addQuad(quad: rdfjs.Quad): void {
      insertBuffer.push(quad);
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
      if (context?.importMode === "replace") {
        await awaitDrainRemoveMatches(options.store);
      }

      for (const quad of insertBuffer) {
        // deno-lint-ignore no-explicit-any
        (options.store as any).addQuad(quad);
      }
      insertBuffer.length = 0;
    },
  };
}
