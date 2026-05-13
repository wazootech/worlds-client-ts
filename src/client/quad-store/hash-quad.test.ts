import { assertEquals, assertNotEquals } from "@std/assert";
import { DataFactory } from "n3";
import { hashQuad } from "./hash-quad.ts";

const { namedNode, quad, literal } = DataFactory;

Deno.test("hashQuad produces consistent hash for identical quads", async () => {
  const q1 = quad(
    namedNode("http://example.org/s"),
    namedNode("http://example.org/p"),
    literal("hello"),
  );
  const q2 = quad(
    namedNode("http://example.org/s"),
    namedNode("http://example.org/p"),
    literal("hello"),
  );

  const hash1 = await hashQuad(q1);
  const hash2 = await hashQuad(q2);

  assertEquals(hash1, hash2);
});

Deno.test("hashQuad produces different hashes for different quads", async () => {
  const q1 = quad(
    namedNode("http://example.org/s"),
    namedNode("http://example.org/p"),
    literal("hello"),
  );
  const q2 = quad(
    namedNode("http://example.org/s"),
    namedNode("http://example.org/p"),
    literal("world"),
  );

  const hash1 = await hashQuad(q1);
  const hash2 = await hashQuad(q2);

  assertNotEquals(hash1, hash2);
});

Deno.test("hashQuad is valid URL-safe base64", async () => {
  const q1 = quad(
    namedNode("http://example.org/s"),
    namedNode("http://example.org/p"),
    literal("hello"),
  );
  const hash = await hashQuad(q1);

  // Verify no slashes or plus signs that are illegal in base64url
  assertEquals(hash.includes("/"), false);
  assertEquals(hash.includes("+"), false);
  assertEquals(hash.length > 0, true);
});
