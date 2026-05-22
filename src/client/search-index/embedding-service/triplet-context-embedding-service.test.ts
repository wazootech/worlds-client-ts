import { assertEquals } from "@std/assert";
import { FakeEmbeddingService } from "./fake-embedding-service.ts";
import { isChunkTextEmbeddingService } from "./chunk-text-embedding-service.ts";
import { TripletContextEmbeddingService } from "./triplet-context-embedding-service.ts";

Deno.test("TripletContextEmbeddingService - formatChunkText enriches chunk rows", () => {
  const service = new TripletContextEmbeddingService({
    inner: new FakeEmbeddingService(),
  });

  assertEquals(isChunkTextEmbeddingService(service), true);

  const formatted = service.formatChunkText({
    quad_id: "id-1",
    subject: "http://example.org/Aurelia",
    predicate: "http://example.org/hasCapital",
    graph: "",
    value: "Lume",
  });

  assertEquals(
    formatted,
    "Factual context about Aurelia: Aurelia has capital Lume.",
  );
});

Deno.test("TripletContextEmbeddingService - embed delegates to inner service", async () => {
  const service = new TripletContextEmbeddingService({
    inner: new FakeEmbeddingService(),
  });

  const vectors = await service.embed(["query text"]);
  assertEquals(vectors.length, 1);
  assertEquals(vectors[0]!.length, 32);
});
