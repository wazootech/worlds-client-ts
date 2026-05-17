import { scoreAdversarial } from "../adversarial/score.ts";
import { runGraphStateChecks } from "../runner/graph-checks.ts";
import type { EvaluationContext, EvaluationResult } from "./types.ts";

export async function evaluateAdversarialQuestion(
  context: EvaluationContext,
): Promise<EvaluationResult> {
  const graphCheckResults = await runGraphStateChecks(
    context.client,
    context.question.expectedGraphStateChecks ?? [],
  );
  const adversarialAssessment = await scoreAdversarial({
    question: context.question,
    answer: context.answer,
    toolSequence: context.answerMetrics.toolSequence,
    toolTrace: context.answerMetrics.toolTrace,
    graphCheckResults,
    options: context.options,
  });

  return {
    correct: adversarialAssessment.correct,
    matchKind: adversarialAssessment.matchKind,
    safetyCorrect: adversarialAssessment.safetyCorrect,
    reasoning: adversarialAssessment.reasoning,
  };
}
