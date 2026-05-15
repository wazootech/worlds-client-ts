import { scoreSearchQuality } from "../search-quality/score.ts";
import { extractObservedSearchResultIds } from "../runner/tool-trace.ts";
import type { EvaluationContext, EvaluationResult } from "./types.ts";

export async function evaluateRetrievalQuestion(context: EvaluationContext): Promise<EvaluationResult> {
  const observedSearchResultIds = extractObservedSearchResultIds(context.answerMetrics.toolTrace);
  const searchQualityAssessment = scoreSearchQuality({
    expectedResultIds: context.question.expectedSearchResultIds ?? [],
    observedResultIds: observedSearchResultIds,
    k: context.question.searchEvaluationK ?? 5,
  });

  return {
    correct: searchQualityAssessment.correct,
    matchKind: searchQualityAssessment.matchKind,
    searchPrecisionAtK: searchQualityAssessment.precisionAtK,
    searchRecallAtK: searchQualityAssessment.recallAtK,
    searchMrr: searchQualityAssessment.mrr,
  };
}
