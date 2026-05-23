import type { Client as LibsqlClient } from "@libsql/client";
import type { QuadFilter } from "@/client/quad-store/mod.ts";
import type { EmbeddingService } from "@/client/search-index/embedding-service/mod.ts";
import type { TextSplitterInterface } from "@/client/search-index/quad-chunker/mod.ts";

/**
 * LibsqlClientBaseOptions lists configuration shared by hydrated-N3 and hexastore LibSQL clients.
 */
export interface LibsqlClientBaseOptions {
  /** client is the underlying LibSQL client pointing to the database. */
  client: LibsqlClient;

  /** embeddingService is an optional service projected for transforming text literals into comparison vectors. */
  embeddingService?: EmbeddingService;

  /** textSplitter is an optional custom text splitting facility, defaults to sensible character-based splitting. */
  textSplitter?: TextSplitterInterface;

  /** maxLookupChunkSize specifies the maximum number of host parameters allowed in cache query IN clauses before split-chunking. Defaults to a conservative 800 (safely below historical SQLite 999 SQLITE_MAX_VARIABLE_NUMBER variable caps with generous headroom). */
  maxLookupChunkSize?: number;

  /** quadFilter defines positive synchronization inclusion boundaries for LibSQL persistence and search indexing. */
  quadFilter?: QuadFilter;

  /**
   * vectorDimensions pins F32_BLOB width for chunk vectors and must match every embedding produced when embeddingService is set (default 32).
   */
  vectorDimensions?: number;

  /**
   * matchPageSize limits rows per LibsqlStore.match SQL round-trip on hexastore reads (default 1000).
   */
  matchPageSize?: number;

  /**
   * labelPredicates extends built-in label IRIs used for subject alias discovery (union, deduped).
   */
  labelPredicates?: string[];

  /**
   * searchIndexOnImport when false skips chunk/FTS projection on every commit and does not rebuild after import.
   * Use for SPARQL-only bulk loads; call Client.rebuildSearchIndex() before search().
   */
  searchIndexOnImport?: boolean;

  /**
   * deferSearchIndexOnImport persists quads on each import and rebuilds FTS/vector chunks afterward via Client.rebuildSearchIndex().
   * Enable only on LibSQL clients dedicated to large bulk loads; omit for normal incremental use.
   * Cannot be combined with searchIndexOnImport: false.
   */
  deferSearchIndexOnImport?: boolean;
}

/**
 * assertLibsqlClientIndexingOptions rejects mutually exclusive LibSQL search-indexing flags.
 */
export function assertLibsqlClientIndexingOptions(
  options: Pick<
    LibsqlClientBaseOptions,
    "searchIndexOnImport" | "deferSearchIndexOnImport"
  >,
): void {
  if (
    options.searchIndexOnImport === false &&
    options.deferSearchIndexOnImport === true
  ) {
    throw new Error(
      "searchIndexOnImport: false cannot be combined with deferSearchIndexOnImport: true",
    );
  }
}
