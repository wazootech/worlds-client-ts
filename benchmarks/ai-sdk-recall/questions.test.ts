import { assertEquals } from "@std/assert";
import questions from "./questions.json" with { type: "json" };

Deno.test("questions dataset stays populated and shaped correctly", () => {
  assertEquals(questions.length >= 18, true);
  assertEquals(new Set(questions.map((question) => question.id)).size, questions.length);
  for (const question of questions) {
    assertEquals(typeof question.question, "string");
    assertEquals(typeof question.answer, "string");
  }
});
