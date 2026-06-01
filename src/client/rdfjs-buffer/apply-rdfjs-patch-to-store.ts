import type * as rdfjs from "@rdfjs/types";
import type { CommitHandler } from "@/client/quad-store/mod.ts";
import {
  awaitDrainRemoveMatches,
  isReplaceImportCommit,
} from "@/client/quad-store/mod.ts";

/**
 * createRdfjsStoreCommitHandler builds a CommitHandler that applies buffered patches to an RDF/JS store.
 */
export function createRdfjsStoreCommitHandler(
  store: rdfjs.Store,
): CommitHandler {
  return async (patch, context) => {
    if (isReplaceImportCommit(context)) {
      await awaitDrainRemoveMatches(store);
    }

    for (const deletion of patch.deletions) {
      applyQuadDeletion(store, deletion);
    }

    for (const insertion of patch.insertions) {
      applyQuadInsertion(store, insertion);
    }
  };
}

function applyQuadInsertion(store: rdfjs.Store, quad: rdfjs.Quad): void {
  const storeWithAddQuad = store as rdfjs.Store & {
    addQuad?: (quad: rdfjs.Quad) => void;
  };
  if (storeWithAddQuad.addQuad) {
    storeWithAddQuad.addQuad(quad);
    return;
  }
  const storeWithAdd = store as rdfjs.Store & {
    add?: (quad: rdfjs.Quad) => void;
  };
  if (storeWithAdd.add) {
    storeWithAdd.add(quad);
    return;
  }

  throw new Error(
    "RDF/JS store does not support quad insertion for patch commits",
  );
}

function applyQuadDeletion(store: rdfjs.Store, quad: rdfjs.Quad): void {
  const storeWithRemoveQuad = store as rdfjs.Store & {
    removeQuad?: (quad: rdfjs.Quad) => void;
  };
  if (storeWithRemoveQuad.removeQuad) {
    storeWithRemoveQuad.removeQuad(quad);
    return;
  }

  throw new Error(
    "RDF/JS store does not support explicit quad deletion for patch commits",
  );
}
