import type { SearchIndexTopology } from "@/client/quad-store/mod.ts";

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
