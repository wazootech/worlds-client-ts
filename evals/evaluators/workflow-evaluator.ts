import { scoreWorkflow } from "../workflows/score.ts";
import { runGraphStateChecks } from "../runner/graph-checks.ts";
import type { EvaluationContext, EvaluationResult } from "./types.ts";

export async function evaluateWorkflowQuestion(
  context: EvaluationContext,
): Promise<EvaluationResult> {
  const graphCheckResults = await runGraphStateChecks(
    context.client,
    context.question.expectedGraphStateChecks ?? [],
  );
  const workflowAssessment = scoreWorkflow({
    question: context.question,
    toolSequence: context.answerMetrics.toolSequence,
    answer: context.answer,
    graphCheckResults,
  });

  return {
    correct: workflowAssessment.correct,
    matchKind: workflowAssessment.matchKind,
    workflowCorrect: workflowAssessment.workflowCorrect,
  };
}
