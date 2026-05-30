import type { Patch, PatchCommitContext } from "@/client/quad-store/mod.ts";
import { hashQuad } from "@/client/quad-store/mod.ts";

import {
  bumpDatasetGeneration,
  garbageCollectOrphanedGenerations,
  readActiveGeneration,
} from "../denokv-dataset-generation.ts";
import { buildGenerationDataPrefix } from "../denokv-hexastore-keys.ts";
import {
  DEFAULT_DENOKV_HEXASTORE_INDEXES,
  type DenokvHexastoreIndex,
} from "../denokv-hexastore-index-set.ts";
import { commitBatchedKvMutations } from "../denokv-kv-limits.ts";
import { materializeQuadKeys } from "../denokv-quad-keys.ts";
import { serializeTerm } from "../denokv-serialization.ts";

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
  context?: PatchCommitContext,
): Promise<void> {
  const keyPrefix = options.keyPrefix ?? ["quads"];
  const enabledIndexes = options.enabledHexastoreIndexes ??
    DEFAULT_DENOKV_HEXASTORE_INDEXES;

  if (context?.importMode === "replace") {
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

  const insertMutations: Array<{ key: Deno.KvKey; value: unknown }> = [];

  for (const storedQuad of patch.insertions) {
    const quadId = await hashQuad(storedQuad);
    const { primaryKey, indexKeys, serializedQuad } = materializeQuadKeys({
      scopedDataPrefix,
      enabledIndexes,
      storedQuad,
      quadId,
      serializedQuad: {
        subject: serializeTerm(storedQuad.subject),
        predicate: serializeTerm(storedQuad.predicate),
        object: serializeTerm(storedQuad.object),
        graph: serializeTerm(storedQuad.graph),
      },
    });

    insertMutations.push({ key: primaryKey, value: serializedQuad });
    for (const indexKey of indexKeys) {
      insertMutations.push({ key: indexKey, value: quadId });
    }
  }

  if (insertMutations.length > 0) {
    await commitBatchedKvMutations(kv, (batch) => {
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
  const insertMutations: Array<{ key: Deno.KvKey; value: unknown }> = [];

  for (const storedQuad of patch.deletions) {
    const quadId = await hashQuad(storedQuad);
    const { primaryKey, indexKeys } = materializeQuadKeys({
      scopedDataPrefix,
      enabledIndexes,
      storedQuad,
      quadId,
    });

    deleteMutations.push(primaryKey, ...indexKeys);
  }

  for (const storedQuad of patch.insertions) {
    const quadId = await hashQuad(storedQuad);
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

  await commitBatchedKvMutations(kv, (batch) => {
    for (const key of deleteMutations) {
      batch.delete(key);
    }
    for (const { key, value } of insertMutations) {
      batch.set(key, value);
    }
  });
}
