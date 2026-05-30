/**
 * SearchIndexTopology distinguishes materialized FTS/vector indexes from scan-at-query-time indexes.
 */
export type SearchIndexTopology = "materialized" | "scan";

/**
 * ClientCapabilities exposes topology facts callers need beyond SearchIndexInterface method shapes.
 */
export interface ClientCapabilities {
  /**
   * searchIndexTopology is "materialized" when reindex rebuilds durable FTS/vector chunks;
   * "scan" when search scans quads at query time and reindex is typically a no-op.
   */
  searchIndexTopology: SearchIndexTopology;
}
