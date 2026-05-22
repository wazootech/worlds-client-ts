import type { ChunkRowPayload } from "@/client/search-index/quad-chunker/mod.ts";
import { formatQuadChunkText } from "@/client/search-index/quad-chunker/format-quad-chunk-text.ts";
import type { ChunkTextEmbeddingService } from "./chunk-text-embedding-service.ts";
import type { EmbeddingService } from "./embedding-service.ts";

/**
 * TripletContextEmbeddingServiceOptions configures TripletContextEmbeddingService.
 */
export interface TripletContextEmbeddingServiceOptions {
  /** inner is the embedding model used after chunk text enrichment. */
  inner: EmbeddingService;
}

/**
 * TripletContextEmbeddingService wraps an EmbeddingService with subject/predicate chunk enrichment.
 */
export class TripletContextEmbeddingService
  implements ChunkTextEmbeddingService {
  private readonly inner: EmbeddingService;

  public constructor(options: TripletContextEmbeddingServiceOptions) {
    this.inner = options.inner;
  }

  /**
   * formatChunkText returns a natural-language fact string for hybrid search indexing.
   */
  public formatChunkText(chunk: ChunkRowPayload): string {
    return formatQuadChunkText(chunk);
  }

  /**
   * embed delegates vectorization to the wrapped embedding service.
   */
  public embed(
    texts: string[],
  ): Promise<Array<Float32Array | number[]>> {
    return this.inner.embed(texts);
  }
}
