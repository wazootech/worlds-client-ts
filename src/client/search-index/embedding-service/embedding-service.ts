/**
 * EmbeddingService defines the abstract projection interface required to map
 * textual inputs into continuous, high-dimensional dense vector representations
 * suitable for nearest-neighbor mathematical search traversal.
 */
export interface EmbeddingService {
  /**
   * project performs external or local transformation of textual input.
   *
   * @param text Clean input sequence targeted for vectorizing.
   * @returns Vector space projection array (Float32 sequence preferred).
   */
  embed(text: string): Promise<Float32Array | number[]>;
}
