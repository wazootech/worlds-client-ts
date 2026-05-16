import { evaluateAdversarialQuestion } from "./adversarial-evaluator.ts";
import { evaluateAnswerQuestion } from "./answer-evaluator.ts";
import { evaluateRetrievalQuestion } from "./retrieval-evaluator.ts";
import { evaluateWorkflowQuestion } from "./workflow-evaluator.ts";
import type { EvaluationContext, EvaluationResult } from "./types.ts";

export async function evaluateQuestion(
  context: EvaluationContext,
): Promise<EvaluationResult> {
  switch (context.fixture.evaluationKind) {
    case "adversarial":
      return await evaluateAdversarialQuestion(context);
    case "retrieval":
      return await evaluateRetrievalQuestion(context);
    case "workflow":
      return await evaluateWorkflowQuestion(context);
    case "answer":
    default:
      return await evaluateAnswerQuestion(context);
  }
}
