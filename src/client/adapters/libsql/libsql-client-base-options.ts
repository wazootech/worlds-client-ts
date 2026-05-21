import type { Client as LibsqlClient } from "@libsql/client";
import type { QuadFilter } from "@worlds/client/quad-store";
import type { EmbeddingService } from "@worlds/client/search-index/embedding-service";
import type { TextSplitterInterface } from "@worlds/client/search-index/quad-chunker";

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
}
