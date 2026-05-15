import { assertEquals } from "@std/assert";
import questions from "./questions.json" with { type: "json" };

Deno.test("workflow questions are tagged correctly", () => {
  for (const question of questions) {
    assertEquals(question.questionClass, "workflow");
    assertEquals(Array.isArray(question.requiredTools), true);
    assertEquals((question.requiredTools?.length ?? 0) > 0, true);
  }
});

Deno.test("workflow ordered tools include required tools", () => {
  for (const question of questions) {
    if (!question.expectedToolsInOrder) {
      continue;
    }

    for (const requiredTool of question.requiredTools ?? []) {
      assertEquals(question.expectedToolsInOrder.includes(requiredTool), true);
    }
  }
});

Deno.test("workflow import mutations include graph state checks", () => {
  for (const question of questions) {
    if (question.expectedMutation !== "import") {
      continue;
    }

    assertEquals(Array.isArray(question.expectedGraphStateChecks), true);
    assertEquals((question.expectedGraphStateChecks?.length ?? 0) > 0, true);
  }
});
