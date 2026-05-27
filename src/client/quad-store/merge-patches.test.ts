import { assertEquals } from "@std/assert";
import { DataFactory } from "n3";
import type { Patch } from "./patch.ts";
import { mergePatches } from "./merge-patches.ts";

const { quad, namedNode, literal } = DataFactory;

Deno.test("mergePatches - returns empty patch for empty input", () => {
  const merged = mergePatches([]);

  assertEquals(merged.insertions, []);
  assertEquals(merged.deletions, []);
});

Deno.test("mergePatches - concatenates insertions and deletions in order", () => {
  const firstQuad = quad(namedNode("u:s1"), namedNode("u:p"), literal("a"));
  const secondQuad = quad(namedNode("u:s2"), namedNode("u:p"), literal("b"));
  const thirdQuad = quad(namedNode("u:s3"), namedNode("u:p"), literal("c"));

  const patches: Patch[] = [
    { insertions: [firstQuad], deletions: [] },
    { insertions: [secondQuad], deletions: [firstQuad] },
    { insertions: [thirdQuad], deletions: [] },
  ];

  const merged = mergePatches(patches);

  assertEquals(merged.insertions, [firstQuad, secondQuad, thirdQuad]);
  assertEquals(merged.deletions, [firstQuad]);
});

Deno.test(
  "mergePatches - preserves Comunica-like multi-step patch sequence",
  () => {
    const insertedQuad = quad(
      namedNode("urn:agent"),
      namedNode("urn:wrote"),
      literal("Automated"),
    );
    const replacedQuad = quad(
      namedNode("urn:agent"),
      namedNode("urn:wrote"),
      literal("Revised"),
    );

    const comunicaLikePatches: Patch[] = [
      { insertions: [insertedQuad], deletions: [] },
      { insertions: [], deletions: [insertedQuad] },
      { insertions: [replacedQuad], deletions: [] },
    ];

    const merged = mergePatches(comunicaLikePatches);

    assertEquals(merged.insertions, [insertedQuad, replacedQuad]);
    assertEquals(merged.deletions, [insertedQuad]);
  },
);
