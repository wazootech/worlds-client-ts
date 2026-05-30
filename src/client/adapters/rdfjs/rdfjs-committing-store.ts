import type * as rdfjs from "@rdfjs/types";
import type { CommittingRdfjsStore } from "@/client/quad-store/import-export-via-rdfjs-store.ts";
import type { PatchCommitContext } from "@/client/quad-store/mod.ts";
import { awaitDrainRemoveMatches } from "@/client/quad-store/mod.ts";

/**
 * RdfjsCommittingStoreOptions configures an in-memory CommittingRdfjsStore adapter.
 */
export interface RdfjsCommittingStoreOptions {
  /** store is the underlying RDF/JS graph mutated on commit. */
  store: rdfjs.Store;
}

/**
 * createRdfjsCommittingStore buffers import quads until commit, matching durable import ordering.
 */
export function createRdfjsCommittingStore(
  options: RdfjsCommittingStoreOptions,
): CommittingRdfjsStore {
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
