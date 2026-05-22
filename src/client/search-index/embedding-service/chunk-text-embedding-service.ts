import type { ChunkRowPayload } from "@/client/search-index/quad-chunker/mod.ts";
import type { EmbeddingService } from "./embedding-service.ts";

/**
 * ChunkTextEmbeddingService extends EmbeddingService with index-time chunk text enrichment.
 */
export interface ChunkTextEmbeddingService extends EmbeddingService {
  /**
   * formatChunkText returns the text stored in FTS and passed to embed() for a search chunk row.
   */
  formatChunkText(chunk: ChunkRowPayload): string;
}

/**
 * isChunkTextEmbeddingService narrows services that implement formatChunkText.
 */
export function isChunkTextEmbeddingService(
  service: EmbeddingService,
): service is ChunkTextEmbeddingService {
  return typeof (service as ChunkTextEmbeddingService).formatChunkText ===
    "function";
}
