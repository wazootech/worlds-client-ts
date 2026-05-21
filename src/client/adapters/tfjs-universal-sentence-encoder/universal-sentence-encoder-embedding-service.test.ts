import { assertEquals } from "@std/assert";
import { UniversalSentenceEncoderEmbeddingService } from "./universal-sentence-encoder-embedding-service.ts";

Deno.test(
  "UniversalSentenceEncoderEmbeddingService.embed - returns empty array for empty input without loading model",
  async () => {
    const embeddingService = new UniversalSentenceEncoderEmbeddingService();
    const vectors = await embeddingService.embed([]);

    assertEquals(vectors, []);
  },
);
