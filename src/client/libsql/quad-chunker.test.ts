import { assertEquals } from "@std/assert";
import { DataFactory } from "n3";
import { QuadChunker } from "./quad-chunker.ts";

const { quad, namedNode, literal } = DataFactory;

Deno.test("QuadChunker - Behavior 1 (Tracer Bullet): ingests standard short literal quad", async () => {
  const chunker = new QuadChunker();

  // Construct a test quad: <urn:bob> <urn:bio> "Bob is a dev"
  const testQuad = quad(
    namedNode("urn:bob"),
    namedNode("urn:bio"),
    literal("Bob is a dev"),
  );

  // Execute chunking
  const chunks = await chunker.chunk(testQuad);

  // Verify single output mapping exactly
  assertEquals(
    chunks.length,
    1,
    "Should yield exactly one chunk for short text",
  );
  assertEquals(chunks[0].subject, "urn:bob");
  assertEquals(chunks[0].predicate, "urn:bio");
  assertEquals(chunks[0].value, "Bob is a dev");
});

Deno.test("QuadChunker - Behavior 2: splits large literal text based on chunkSize threshold", async () => {
  // Force tiny chunk size to easily trigger splitting
  const chunker = new QuadChunker({
    chunkSize: 10,
    chunkOverlap: 0,
  });

  // Total length ~23, should yield at least 2-3 chunks at max 10 chars each
  const testQuad = quad(
    namedNode("urn:subject"),
    namedNode("urn:predicate"),
    literal("First line.\nSecond line."),
  );

  const chunks = await chunker.chunk(testQuad);

  // Should have generated multiple distinct items
  assertEquals(chunks.length > 1, true, "Should generate more than one chunk");

  // All derived chunks must preserve the source relation identifers
  for (const c of chunks) {
    assertEquals(c.subject, "urn:subject");
    assertEquals(c.predicate, "urn:predicate");
  }

  // Combined text should generally reconstruct original content
  const combined = chunks.map((c) => c.value).join("");
  // Depending on how whitespace is trimmed, simple check
  assertEquals(combined.includes("First"), true);
  assertEquals(combined.includes("Second"), true);
});

Deno.test("QuadChunker - Behavior 3: ignores non-literal objects (NamedNode)", async () => {
  const chunker = new QuadChunker();

  // Construct a non-literal triple linking two resources
  const linkQuad = quad(
    namedNode("urn:alice"),
    namedNode("urn:knows"),
    namedNode("urn:bob"), // Non-literal object
  );

  const chunks = await chunker.chunk(linkQuad);

  // Expected to discard since it's not indexable text
  assertEquals(chunks.length, 0, "Should produce 0 chunks for node links");
});
