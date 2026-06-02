import { batchedAtomic } from "@kitsonk/kv-toolbox/batched_atomic";

/**
 * denokvKvLimits summarizes Deno KV constraints and how
 * [kv-toolbox](https://github.com/kitsonk/kv-toolbox) works around them.
 *
 * Deno KV enforces per-key value size (~64 KiB), per-atomic mutation count, and
 * per-commit total key bytes (~80 KiB) and payload size (~800 KiB); see
 * `deno/ext/kv/lib.rs` and kv-toolbox `batched_atomic.ts`.
 *
 * **Large values** — kv-toolbox [`blob.set()`](https://github.com/kitsonk/kv-toolbox/blob/main/blob.ts)
 * transparently chunks blob data across sub-keys so a single logical value can exceed the
 * per-key cap. Use that API when persisted quad payloads or search blobs grow past ~64 KiB.
 *
 * **Large transactions** — kv-toolbox
 * [`batchedAtomic()`](https://github.com/kitsonk/kv-toolbox/blob/main/batched_atomic.ts)
 * queues checks and mutations, then splits them across as many `atomic.commit()` calls as needed
 * so callers do not hit key-size or mutation limits during bulk quad index writes.
 *
 * Hexastore secondary index keys embed RDF term parts for `match()` routing. Long literals
 * inflate *key* byte size (not value size); `batchedAtomic()` addresses that at commit time.
 * Shortening keys (hashed term segments) would be a separate schema change.
 */

/** BatchedKvAtomic is the kv-toolbox atomic queue used for quad index bulk writes. */
export type BatchedAtomicOperation = ReturnType<typeof batchedAtomic>;
export type BatchedKvAtomic = BatchedAtomicOperation;

/**
 * commitBatchedKvMutations applies queued KV writes via kv-toolbox `batchedAtomic()`.
 */
export async function commitBatchedKvMutations(
  kv: Deno.Kv,
  applyMutations: (batch: BatchedKvAtomic) => void,
): Promise<void> {
  const batch = batchedAtomic(kv);
  applyMutations(batch);
  const commitResults = await batch.commit();
  for (const commitResult of commitResults) {
    if (!commitResult.ok) {
      throw new Error("Deno KV batched atomic commit failed");
    }
  }
}
