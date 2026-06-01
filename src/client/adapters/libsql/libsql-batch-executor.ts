import type { Client, InStatement } from "@libsql/client";

/** DEFAULT_MAX_LOOKUP_CHUNK_SIZE is the default IN-clause and deletion chunk width. */
export const DEFAULT_MAX_LOOKUP_CHUNK_SIZE = 800;

/** DEFAULT_MAX_WRITE_BATCH_SIZE limits statements per LibSQL write batch. */
export const DEFAULT_MAX_WRITE_BATCH_SIZE = 500;

/** STAGING_FLUSH_THRESHOLD flushes staged SQL during large commits to avoid huge in-memory arrays. */
export const STAGING_FLUSH_THRESHOLD = 10_000;

/**
 * appendInStatements appends statements without spread (large patches overflow the call stack).
 */
export function appendInStatements(
  target: InStatement[],
  source: readonly InStatement[],
): void {
  const sourceLength = source.length;
  for (let index = 0; index < sourceLength; index++) {
    target.push(source[index]!);
  }
}

/**
 * executeWriteBatches runs LibSQL write batches in fixed-size slices.
 */
export async function executeWriteBatches(
  client: Client,
  statements: InStatement[],
  batchSize: number,
): Promise<void> {
  for (let index = 0; index < statements.length; index += batchSize) {
    const statementBatch = statements.slice(index, index + batchSize);
    await client.batch(statementBatch, "write");
  }
}

/**
 * flushStagedStatements executes and clears staged write statements when the threshold is reached.
 */
export async function flushStagedStatements(
  client: Client,
  statements: InStatement[],
  writeBatchSize: number,
): Promise<void> {
  if (statements.length === 0) {
    return;
  }
  await executeWriteBatches(client, statements, writeBatchSize);
  statements.length = 0;
}

/**
 * stageInStatements appends statements and flushes when the staging buffer grows too large.
 */
export async function stageInStatements(
  client: Client,
  statements: InStatement[],
  source: readonly InStatement[],
  writeBatchSize: number,
): Promise<void> {
  appendInStatements(statements, source);
  if (statements.length >= STAGING_FLUSH_THRESHOLD) {
    await flushStagedStatements(client, statements, writeBatchSize);
  }
}
