import { assertEquals } from "@std/assert";
import { assessAnswer, normalizeText } from "./score.ts";

Deno.test("normalizeText collapses punctuation and case", () => {
  assertEquals(normalizeText("  Tide-Shell!  "), "tide shell");
});

Deno.test("assessAnswer accepts exact matches inside final answers", () => {
  const result = assessAnswer("The capital is Lume.", "Lume");
  assertEquals(result, { correct: true, matchKind: "exact" });
});

Deno.test("assessAnswer accepts aliases as a distinct match kind", () => {
  const result = assessAnswer(
    "It is the northern realm.",
    "Borealis",
    ["northern realm"],
  );

  assertEquals(result, { correct: true, matchKind: "alias" });
});

Deno.test("assessAnswer rejects unrelated answers", () => {
  const result = assessAnswer("I do not know.", "Moonwell", ["Moonwell Nation"]);
  assertEquals(result, { correct: false, matchKind: "wrong" });
});
