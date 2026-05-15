import { assertEquals } from "@std/assert";
import questions from "./questions.json" with { type: "json" };

Deno.test("search-quality questions are tagged correctly", () => {
  for (const question of questions) {
    assertEquals(question.questionClass, "retrieval");
    assertEquals(question.expectedTool, "searchWorld");
    assertEquals(Array.isArray(question.expectedSearchResultIds), true);
    assertEquals((question.expectedSearchResultIds?.length ?? 0) > 0, true);
    assertEquals(typeof question.searchEvaluationK, "number");
  }
});
