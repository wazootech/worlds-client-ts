import { assertEquals } from "@std/assert";
import { formatQuadChunkText } from "./format-quad-chunk-text.ts";

Deno.test("formatQuadChunkText - enriches subject and predicate around object value", () => {
  const formatted = formatQuadChunkText({
    quad_id: "hash-aurelia",
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

Deno.test("formatQuadChunkText - humanizes underscore and camelCase IRIs", () => {
  const formatted = formatQuadChunkText({
    quad_id: "hash-bob",
    subject: "urn:entity_bob",
    predicate: "urn:hasBio",
    graph: "",
    value: "Bob is a dev",
  });

  assertEquals(
    formatted.includes("entity bob"),
    true,
    "subject label should decode separators",
  );
  assertEquals(
    formatted.includes("has bio"),
    true,
    "predicate phrase should decode camelCase",
  );
  assertEquals(formatted.includes("Bob is a dev"), true);
});
