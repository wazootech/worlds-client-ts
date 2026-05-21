import { assertEquals } from "@std/assert";
import type * as rdfjs from "@rdfjs/types";
import { DataFactory } from "n3";
import { DenokvQuadStore } from "./denokv-quad-store.ts";
import { DenokvSearchIndex } from "./denokv-search-index.ts";

const { namedNode, literal, quad } = DataFactory;

/**
 * seedQuads persists quads into an in-memory Deno Kv instance for search tests.
 */
async function seedQuads(
  kv: Deno.Kv,
  quads: rdfjs.Quad[],
): Promise<void> {
  const quadStore = new DenokvQuadStore({ kv });
  await quadStore.import({
    mode: "merge",
    source: { kind: "quads", quads },
  });
}

Deno.test(
  "DenokvSearchIndex.search - returns literal matching text locally",
  async () => {
    const kv = await Deno.openKv(":memory:");
    try {
      await seedQuads(kv, [
        quad(
          namedNode("http://example.com/entity1"),
          namedNode("http://example.com/hasDesc"),
          literal("Found some delicious tacos for lunch"),
        ),
        quad(
          namedNode("http://example.com/entity2"),
          namedNode("http://example.com/hasDesc"),
          literal("Boring non-matching payload"),
        ),
      ]);

      const searchIndex = new DenokvSearchIndex({ kv });
      const response = await searchIndex.search({ query: "Tacos" });

      assertEquals(response.results?.length, 1);
      assertEquals(
        response.results?.[0].text,
        "Found some delicious tacos for lunch",
      );
    } finally {
      kv.close();
    }
  },
);

Deno.test(
  "DenokvSearchIndex.search - inclusion filters strictly limit results to allowed subjects",
  async () => {
    const kv = await Deno.openKv(":memory:");
    const targetSubject = "http://example.com/target";
    try {
      await seedQuads(kv, [
        quad(
          namedNode(targetSubject),
          namedNode("http://example.com/desc"),
          literal("Match me!"),
        ),
        quad(
          namedNode("http://example.com/wrong"),
          namedNode("http://example.com/desc"),
          literal("Match me!"),
        ),
      ]);

      const searchIndex = new DenokvSearchIndex({ kv });
      const response = await searchIndex.search({
        query: "match",
        include: { subjects: [targetSubject] },
      });

      assertEquals(response.results?.length, 1);
      assertEquals(response.results?.[0].subject, targetSubject);
    } finally {
      kv.close();
    }
  },
);

Deno.test(
  "DenokvSearchIndex.search - exclusion filters correctly strip matching predicates",
  async () => {
    const kv = await Deno.openKv(":memory:");
    const excludePred = "http://example.com/hidden";
    try {
      await seedQuads(kv, [
        quad(
          namedNode("http://example.com/subject"),
          namedNode(excludePred),
          literal("Secret text query"),
        ),
      ]);

      const searchIndex = new DenokvSearchIndex({ kv });
      const response = await searchIndex.search({
        query: "secret",
        exclude: { predicates: [excludePred] },
      });

      assertEquals(
        response.results?.length,
        0,
        "Excluded predicate hit should have been filtered out",
      );
    } finally {
      kv.close();
    }
  },
);

Deno.test(
  "DenokvSearchIndex.search - ignores structured primitives to suppress search space noise",
  async () => {
    const kv = await Deno.openKv(":memory:");
    try {
      await seedQuads(kv, [
        quad(
          namedNode("http://example.com/s1"),
          namedNode("http://example.com/p1"),
          literal("The magic number is 42"),
        ),
        quad(
          namedNode("http://example.com/s2"),
          namedNode("http://example.com/p1"),
          literal(
            "42",
            namedNode("http://www.w3.org/2001/XMLSchema#integer"),
          ),
        ),
      ]);

      const searchIndex = new DenokvSearchIndex({ kv });
      const response = await searchIndex.search({ query: "42" });

      assertEquals(
        response.results?.length,
        1,
        "Expected raw integer literal to be completely ignored in search index matching",
      );
      assertEquals(
        response.results?.[0].text,
        "The magic number is 42",
      );
    } finally {
      kv.close();
    }
  },
);
