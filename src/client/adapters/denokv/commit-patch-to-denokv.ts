import type * as rdfjs from "@rdfjs/types";
import type { Patch, TransactionContext } from "@/client/quad-store/mod.ts";
import { isReplaceImportCommit } from "@/client/quad-store/mod.ts";
import { hashQuads } from "@/client/quad-store/mod.ts";

import {
  bumpDatasetGeneration,
  garbageCollectOrphanedGenerations,
  readActiveGeneration,
} from "./kv/denokv-dataset-generation.ts";
import { buildGenerationDataPrefix } from "./kv/denokv-hexastore-keys.ts";
import {
  DEFAULT_DENOKV_HEXASTORE_INDEXES,
  type DenokvHexastoreIndex,
} from "./kv/denokv-hexastore-index-set.ts";
import {
  type BatchedAtomicOperation,
  commitBatchedKvMutations,
} from "./kv/denokv-kv-limits.ts";
import { materializeQuadKeys } from "./kv/denokv-quad-keys.ts";

/**
 * CommitPatchToDenokvOptions configures Deno KV quad persistence for patch commits.
 */
export interface CommitPatchToDenokvOptions {
  /** kv is the underlying Deno KV database instance. */
  kv: Deno.Kv;

  /** keyPrefix is the namespace prefix for stored quads. Defaults to ["quads"]. */
  keyPrefix?: Deno.KvKey;

  /**
   * enabledHexastoreIndexes controls which KV secondary-index families are materialized.
   * Defaults to all supported index families.
   */
  enabledHexastoreIndexes?: readonly DenokvHexastoreIndex[];
}

/**
 * commitPatchToDenokv persists insertions and deletions to Deno KV primary and hexastore indexes.
 */
export async function commitPatchToDenokv(
  patch: Patch,
  options: CommitPatchToDenokvOptions,
  context?: TransactionContext,
): Promise<void> {
  const keyPrefix = options.keyPrefix ?? ["quads"];
  const enabledIndexes = options.enabledHexastoreIndexes ??
    DEFAULT_DENOKV_HEXASTORE_INDEXES;

  if (isReplaceImportCommit(context)) {
    await commitReplaceImportPatch(
      patch,
      options.kv,
      keyPrefix,
      enabledIndexes,
    );
    return;
  }

  await commitIncrementalPatch(
    patch,
    options.kv,
    keyPrefix,
    enabledIndexes,
  );
}

async function commitReplaceImportPatch(
  patch: Patch,
  kv: Deno.Kv,
  keyPrefix: Deno.KvKey,
  enabledIndexes: readonly DenokvHexastoreIndex[],
): Promise<void> {
  const generationId = await bumpDatasetGeneration(kv, keyPrefix);
  const scopedDataPrefix = buildGenerationDataPrefix(keyPrefix, generationId);
  const insertMutations = await buildKvInsertMutations(
    scopedDataPrefix,
    enabledIndexes,
    patch.insertions,
  );

  if (insertMutations.length > 0) {
    await commitBatchedKvMutations(kv, (batch: BatchedAtomicOperation) => {
      for (const { key, value } of insertMutations) {
        batch.set(key, value);
      }
    });
  }

  await garbageCollectOrphanedGenerations(kv, keyPrefix);
}

async function commitIncrementalPatch(
  patch: Patch,
  kv: Deno.Kv,
  keyPrefix: Deno.KvKey,
  enabledIndexes: readonly DenokvHexastoreIndex[],
): Promise<void> {
  if (patch.insertions.length === 0 && patch.deletions.length === 0) {
    return;
  }

  const generationId = await readActiveGeneration(kv, keyPrefix);
  const scopedDataPrefix = buildGenerationDataPrefix(keyPrefix, generationId);

  const deleteMutations: Deno.KvKey[] = [];
  const deletionQuadIds = await hashQuads(patch.deletions);
  for (let index = 0; index < patch.deletions.length; index++) {
    const storedQuad = patch.deletions[index]!;
    const quadId = deletionQuadIds[index]!;
    const { primaryKey, indexKeys } = materializeQuadKeys({
      scopedDataPrefix,
      enabledIndexes,
      storedQuad,
      quadId,
    });

    deleteMutations.push(primaryKey, ...indexKeys);
  }

  const insertMutations = await buildKvInsertMutations(
    scopedDataPrefix,
    enabledIndexes,
    patch.insertions,
  );

  await commitBatchedKvMutations(kv, (batch: BatchedAtomicOperation) => {
    for (const key of deleteMutations) {
      batch.delete(key);
    }
    for (const { key, value } of insertMutations) {
      batch.set(key, value);
    }
  });
}

async function buildKvInsertMutations(
  scopedDataPrefix: Deno.KvKey,
  enabledIndexes: readonly DenokvHexastoreIndex[],
  quads: readonly rdfjs.Quad[],
): Promise<Array<{ key: Deno.KvKey; value: unknown }>> {
  if (quads.length === 0) {
    return [];
  }

  const quadIds = await hashQuads([...quads]);
  const insertMutations: Array<{ key: Deno.KvKey; value: unknown }> = [];

  for (let index = 0; index < quads.length; index++) {
    const storedQuad = quads[index]!;
    const quadId = quadIds[index]!;
    const { primaryKey, indexKeys, serializedQuad } = materializeQuadKeys({
      scopedDataPrefix,
      enabledIndexes,
      storedQuad,
      quadId,
    });

    insertMutations.push({ key: primaryKey, value: serializedQuad });
    for (const indexKey of indexKeys) {
      insertMutations.push({ key: indexKey, value: quadId });
    }
  }

  return insertMutations;
}
