import { assertEquals } from "@std/assert";
import questions from "./questions.json" with { type: "json" };

Deno.test("all tool-selection questions have expectedTool field", () => {
  for (const q of questions) {
    assertEquals(
      Object.prototype.hasOwnProperty.call(q, "expectedTool"),
      true,
      `question ${q.id} must have expectedTool`,
    );
    assertEquals(typeof q.expectedTool === "string" || q.expectedTool === null, true);
  }
});

Deno.test("searchWorld questions are tagged correctly", () => {
  const searchQuestions = questions.filter((q) => q.expectedTool === "searchWorld");
  assertEquals(searchQuestions.length >= 8, true);
});

Deno.test("executeSparql questions are tagged correctly", () => {
  const sparqlQuestions = questions.filter((q) => q.expectedTool === "executeSparql");
  assertEquals(sparqlQuestions.length >= 8, true);
});

Deno.test("import/export questions present", () => {
  const importQuestions = questions.filter((q) => q.expectedTool === "importRdf");
  const exportQuestions = questions.filter((q) => q.expectedTool === "exportRdf");
  assertEquals(importQuestions.length >= 3, true);
  assertEquals(exportQuestions.length >= 2, true);
});

Deno.test("parametric questions expectedTool is null", () => {
  const parametricQuestions = questions.filter((q) =>
    q.tags?.includes("parametric")
  );
  for (const q of parametricQuestions) {
    assertEquals(q.expectedTool, null, `parametric question ${q.id} should have null expectedTool`);
  }
});

Deno.test("questions dataset shaped correctly", () => {
  assertEquals(questions.length >= 30, true);
  assertEquals(
    new Set(questions.map((q) => q.id)).size,
    questions.length,
  );
  for (const q of questions) {
    assertEquals(typeof q.question, "string");
    assertEquals(typeof q.expectedTool === "string" || q.expectedTool === null, true);
  }
});
