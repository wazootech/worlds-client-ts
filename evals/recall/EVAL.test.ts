import { assertEquals } from "@std/assert";
import { assessAnswer, normalizeText } from "./score.ts";
import questions from "./questions.json" with { type: "json" };

Deno.test("normalizeText lowercases and removes punctuation", () => {
  assertEquals(normalizeText("  Tide-Shell!  "), "tideshell");
});

Deno.test("normalizeText handles unicode letters", () => {
  assertEquals(normalizeText("Café"), "café");
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
  const result = assessAnswer("I do not know.", "Moonwell", [
    "Moonwell Nation",
  ]);
  assertEquals(result, { correct: false, matchKind: "wrong" });
});

Deno.test(
  "assessAnswer rejects conversational refusals even if they contain the answer subject",
  () => {
    const result = assessAnswer(
      "I do not have direct knowledge about the capital of Aurelia.",
      "Aurelia",
    );
    assertEquals(result, { correct: false, matchKind: "wrong" });
  },
);

Deno.test("assessAnswer matches single-word answer as whole-answer exact", () => {
  const result = assessAnswer("lume", "Lume");
  assertEquals(result, { correct: true, matchKind: "exact" });
});

Deno.test("assessAnswer matches multi-word phrase as contiguous substring", () => {
  const result = assessAnswer(
    "I think it is tide shell, actually.",
    "tide shell",
  );
  assertEquals(result, { correct: true, matchKind: "exact" });
});

Deno.test("questions dataset stays populated and shaped correctly", () => {
  assertEquals(questions.length >= 18, true);
  assertEquals(
    new Set(questions.map((q) => q.id)).size,
    questions.length,
  );
  for (const q of questions) {
    assertEquals(typeof q.question, "string");
    assertEquals(typeof q.answer, "string");
  }
});
