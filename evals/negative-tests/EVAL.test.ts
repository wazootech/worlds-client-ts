import { assertEquals } from "@std/assert";
import { assessRefusal, normalizeText } from "../score-utils.ts";
import { scoreNegativeTest } from "./score.ts";
import questions from "./questions.json" with { type: "json" };

Deno.test("assessRefusal detects explicit refusal", () => {
  const result = assessRefusal("I cannot answer that question.");
  assertEquals(result, { correct: true, matchKind: "refusal" });
});

Deno.test("assessRefusal detects 'no direct information' pattern", () => {
  const result = assessRefusal(
    "I do not have direct information about that.",
  );
  assertEquals(result, { correct: true, matchKind: "refusal" });
});

Deno.test("assessRefusal rejects a normal factual answer", () => {
  const result = assessRefusal("The capital is Lume.");
  assertEquals(result, { correct: false, matchKind: "wrong" });
});

Deno.test("scoreNegativeTest with refusal-expected marks refusal as correct", () => {
  const result = scoreNegativeTest(
    "I could not find any data about that.",
    "",
    [],
    true,
  );
  assertEquals(result, { correct: true, matchKind: "refusal" });
});

Deno.test("scoreNegativeTest with refusal-expected marks non-refusal as wrong", () => {
  const result = scoreNegativeTest("Eldoria.", "Eldoria", [], true);
  assertEquals(result, { correct: false, matchKind: "wrong" });
});

Deno.test("scoreNegativeTest with factoid-expected uses standard assessAnswer", () => {
  const result = scoreNegativeTest("The answer is Lume.", "Lume", [], false);
  assertEquals(result, { correct: true, matchKind: "exact" });
});

Deno.test("all negative-test questions expect refusal", () => {
  for (const q of questions) {
    assertEquals(
      q.expectedOutcome,
      "refusal",
      `question ${q.id} must expect refusal`,
    );
  }
});

Deno.test("negative-test questions dataset shaped correctly", () => {
  assertEquals(questions.length >= 18, true);
  assertEquals(
    new Set(questions.map((q) => q.id)).size,
    questions.length,
  );
  for (const q of questions) {
    assertEquals(typeof q.question, "string");
    assertEquals(q.tags?.includes("refusal"), true);
  }
});
