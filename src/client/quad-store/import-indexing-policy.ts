/**
 * SearchIndexOnImport controls when search chunk projection runs during bulk import.
 */
export type SearchIndexOnImport = "incremental" | "deferred" | "disabled";

/**
 * SearchIndexTopology distinguishes materialized FTS/vector indexes from scan-at-query-time indexes.
 */
export type SearchIndexTopology = "materialized" | "scan";

/**
 * ImportIndexingPolicyOptions configures how bulk import interacts with search projection.
 */
export interface ImportIndexingPolicyOptions {
  /** searchIndexOnImport controls when search chunk projection runs during import commits. */
  searchIndexOnImport?: SearchIndexOnImport;

  /** searchIndexTopology describes whether commits can project into durable search tables. */
  searchIndexTopology: SearchIndexTopology;
}

/**
 * ImportCommitProjectionFlags carries per-commit search projection decisions for durable backends.
 */
export interface ImportCommitProjectionFlags {
  /** skipSearchIndexProjection omits FTS/vector chunk writes for this commit. */
  skipSearchIndexProjection: boolean;
}

/**
 * ImportCommitPhase distinguishes import flushes from routine SPARQL UPDATE commits.
 */
export type ImportCommitPhase = "duringImportCommit" | "sparqlUpdateCommit";

/**
 * resolveImportCommitProjectionFlags maps searchIndexOnImport and topology to commit-time projection.
 */
export function resolveImportCommitProjectionFlags(
  options: ImportIndexingPolicyOptions,
  phase: ImportCommitPhase,
): ImportCommitProjectionFlags {
  const searchIndexOnImport = options.searchIndexOnImport ?? "incremental";

  if (options.searchIndexTopology === "scan") {
    return { skipSearchIndexProjection: true };
  }

  if (searchIndexOnImport === "disabled") {
    return { skipSearchIndexProjection: true };
  }

  if (
    phase === "duringImportCommit" && searchIndexOnImport === "deferred"
  ) {
    return { skipSearchIndexProjection: true };
  }

  return { skipSearchIndexProjection: false };
}

/**
 * shouldRunDeferredImportReindex returns whether afterImport should invoke a deferred reindex hook.
 */
export function shouldRunDeferredImportReindex(
  options: ImportIndexingPolicyOptions,
  hasReindexHook: boolean,
): boolean {
  if (options.searchIndexOnImport !== "deferred" || !hasReindexHook) {
    return false;
  }

  if (options.searchIndexTopology === "materialized") {
    return true;
  }

  return hasReindexHook;
}
