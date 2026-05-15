export interface SearchQualityAssessment {
  precisionAtK: number;
  recallAtK: number;
  mrr: number;
  correct: boolean;
  matchKind: "exact" | "wrong";
}

export interface SearchQualityInput {
  expectedResultIds: string[];
  observedResultIds: string[];
  k: number;
}

export function scoreSearchQuality(input: SearchQualityInput): SearchQualityAssessment {
  const truncatedObservedResultIds = input.observedResultIds.slice(0, input.k);
  const expectedResultIds = new Set(input.expectedResultIds);
  const relevantObservedResultCount = truncatedObservedResultIds.filter((resultId) =>
    expectedResultIds.has(resultId)
  ).length;

  const precisionAtK = truncatedObservedResultIds.length === 0
    ? 0
    : relevantObservedResultCount / truncatedObservedResultIds.length;
  const recallAtK = expectedResultIds.size === 0 ? 0 : relevantObservedResultCount / expectedResultIds.size;

  let reciprocalRank = 0;
  for (let resultIndex = 0; resultIndex < truncatedObservedResultIds.length; resultIndex++) {
    if (expectedResultIds.has(truncatedObservedResultIds[resultIndex])) {
      reciprocalRank = 1 / (resultIndex + 1);
      break;
    }
  }

  const correct = recallAtK > 0;

  return {
    precisionAtK,
    recallAtK,
    mrr: reciprocalRank,
    correct,
    matchKind: correct ? "exact" : "wrong",
  };
}
