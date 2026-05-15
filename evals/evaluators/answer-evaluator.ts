import { scoreRefusalWithLLM, scoreWithLLM } from "../llm-scorer.ts";
import { assessAnswer } from "../score-utils.ts";
import type { EvaluationContext, EvaluationResult } from "./types.ts";

export async function evaluateAnswerQuestion(context: EvaluationContext): Promise<EvaluationResult> {
  const { question, answer, answerMetrics, toolTrace } = context;

  let toolCorrect: boolean | undefined;
  if (question.expectedTool !== undefined) {
    if (question.expectedTool === null) {
      const isParametric = question.tags?.includes("parametric") ?? false;
      toolCorrect = isParametric ? answerMetrics.toolCalls === 0 : true;
    } else {
      toolCorrect = toolTrace.some((tc) => {
        try {
          const parsed = JSON.parse(tc);
          return parsed.name === question.expectedTool || parsed.toolName === question.expectedTool;
        } catch {
          return tc.includes(question.expectedTool!);
        }
      });
    }
  }

  if (question.expectedTool !== undefined && !question.answer) {
    return {
      correct: toolCorrect ?? false,
      matchKind: toolCorrect ? "exact" : "wrong",
      toolCorrect,
    };
  }

  if (question.scoringMode === "llm") {
    if (question.expectedOutcome === "refusal") {
      const llmResult = await scoreRefusalWithLLM(question, answer);
      return {
        correct: llmResult.correct,
        matchKind: llmResult.matchKind,
        toolCorrect,
      };
    }

    if (toolTrace.length > 0) {
      const llmResult = await scoreWithLLM(question, answer, toolTrace);
      return {
        correct: llmResult.correct,
        matchKind: llmResult.matchKind,
        toolCorrect,
      };
    }

    return {
      correct: false,
      matchKind: "wrong",
      toolCorrect,
    };
  }

  const assessment = assessAnswer(answer, question.answer, question.aliases);
  return {
    correct: assessment.correct,
    matchKind: assessment.matchKind,
    toolCorrect,
  };
}
