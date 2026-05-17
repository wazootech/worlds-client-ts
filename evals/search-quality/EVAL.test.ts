import { assertEquals } from "@std/assert";
import type { AnswerMetrics } from "../runner.ts";
import { evaluateQuestion } from "../evaluators/mod.ts";
import searchQualityFixture from "./EVAL.ts";
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

Deno.test("search-quality tool-only questions evaluate without runner fallback state", async () => {
  const question = searchQualityFixture.questions[0];
  const expectedSearchResultIds = question.expectedSearchResultIds ?? [];
  const answerMetrics: AnswerMetrics = {
    answer: "",
    toolCalls: 1,
    toolTrace: [JSON.stringify({
      toolName: "searchWorld",
      result: {
        success: true,
        results: expectedSearchResultIds.map((searchResultId) => ({
          id: searchResultId,
        })),
      },
    })],
    latencyMs: 1,
    toolSequence: ["searchWorld"],
    redundantToolCalls: 0,
  };

  const evaluationResult = await evaluateQuestion({
    fixture: searchQualityFixture,
    question,
    answer: "",
    answerMetrics,
    toolTrace: answerMetrics.toolTrace,
  });

  assertEquals(evaluationResult.correct, true);
  assertEquals(evaluationResult.matchKind, "exact");
  assertEquals(evaluationResult.searchPrecisionAtK, 1);
  assertEquals(evaluationResult.searchRecallAtK, 1);
  assertEquals(evaluationResult.searchMrr, 1);
});
