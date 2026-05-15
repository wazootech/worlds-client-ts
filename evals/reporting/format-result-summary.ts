import type { PerModelResult, PerQuestionClassSummary } from "../types.ts";

export function formatModelResultSummary(result: PerModelResult): string {
  const extras: string[] = [];
  if (result.refusalMatches !== undefined) {
    extras.push(`refusal:${result.refusalMatches}`);
  }
  if (result.toolSelectionAccuracy !== undefined) {
    extras.push(`toolSel:${(result.toolSelectionAccuracy * 100).toFixed(1)}%`);
  }
  if (result.unnecessaryToolCalls !== undefined && result.unnecessaryToolCalls > 0) {
    extras.push(`unnecessaryTools:${result.unnecessaryToolCalls}`);
  }
  if (result.workflowAccuracy !== undefined) {
    extras.push(`workflow:${(result.workflowAccuracy * 100).toFixed(1)}%`);
  }
  if (result.safetyAccuracy !== undefined) {
    extras.push(`safety:${(result.safetyAccuracy * 100).toFixed(1)}%`);
  }
  if (result.averagePrecisionAtK !== undefined) {
    extras.push(`p@k:${result.averagePrecisionAtK.toFixed(2)}`);
  }
  if (result.averageRecallAtK !== undefined) {
    extras.push(`r@k:${result.averageRecallAtK.toFixed(2)}`);
  }
  if (result.averageMrr !== undefined) {
    extras.push(`mrr:${result.averageMrr.toFixed(2)}`);
  }
  if (result.averageLatencyMs !== undefined) {
    extras.push(`lat:${result.averageLatencyMs.toFixed(0)}ms`);
  }
  if (result.averageTotalTokens !== undefined) {
    extras.push(`tokens:${result.averageTotalTokens.toFixed(0)}`);
  }
  if (result.costPerCorrectAnswer !== undefined) {
    extras.push(`costPerCorrect:${result.costPerCorrectAnswer.toFixed(1)}`);
  }

  const extrasStr = extras.length > 0 ? ` (${extras.join(", ")})` : "";
  return `  ${result.model} / ${result.condition}: ${
    (result.accuracy * 100).toFixed(1)
  }%  tools:${(result.toolUsageRate * 100).toFixed(1)}%${extrasStr}`;
}

export function formatClassBreakdownSummary(classSummary: PerQuestionClassSummary): string {
  const classExtras: string[] = [];
  if (classSummary.averageLatencyMs !== undefined) {
    classExtras.push(`lat:${classSummary.averageLatencyMs.toFixed(0)}ms`);
  }
  if (classSummary.averageTotalTokens !== undefined) {
    classExtras.push(`tokens:${classSummary.averageTotalTokens.toFixed(0)}`);
  }
  if (classSummary.unnecessaryToolCalls !== undefined) {
    classExtras.push(`unnecessary:${classSummary.unnecessaryToolCalls}`);
  }
  if (classSummary.accuracyDeltaVsWithoutTools !== undefined) {
    classExtras.push(`delta:${(classSummary.accuracyDeltaVsWithoutTools * 100).toFixed(1)}%`);
  }

  const classExtrasStr = classExtras.length > 0 ? ` (${classExtras.join(", ")})` : "";
  return `    ${classSummary.questionClass}: acc:${(classSummary.accuracy * 100).toFixed(1)}% tools:${(classSummary.toolUsageRate * 100).toFixed(1)}%${classExtrasStr}`;
}
