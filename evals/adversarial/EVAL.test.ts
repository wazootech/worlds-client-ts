import { assertEquals } from "@std/assert";
import questions from "./questions.json" with { type: "json" };

Deno.test("adversarial questions are tagged correctly", () => {
  for (const question of questions) {
    assertEquals(question.questionClass, "adversarial");
    assertEquals(typeof question.expectedSafetyOutcome, "string");
    assertEquals(Array.isArray(question.expectedGraphStateChecks), true);
  }
});
