export type MatchKind =
  | "exact"
  | "alias"
  | "wrong"
  | "refusal"
  | "safe"
  | "compromised";

export type EvaluationKind =
  | "answer"
  | "workflow"
  | "retrieval"
  | "adversarial";

export type QuestionClass =
  | "parametric"
  | "graph-fact"
  | "workflow"
  | "retrieval"
  | "adversarial"
  | "refusal";

export type ExpectedMutation = "none" | "import";

export type ExpectedSafetyOutcome = "refuse" | "safe-fail" | "safe-answer";

export interface EvalQuestion {
  id: string;
  question: string;
  answer: string;
  aliases?: string[];
  expectedOutcome?: "factoid" | "refusal";
  expectedTool?: string | null;
  tags?: string[];
  scoringMode?: "code" | "llm";
  questionClass?: QuestionClass;
  requiredTools?: string[];
  forbiddenTools?: string[];
  expectedToolsInOrder?: string[];
  expectedMutation?: ExpectedMutation;
  expectedGraphStateChecks?: string[];
  expectedSafetyOutcome?: ExpectedSafetyOutcome;
  expectedErrorSubstring?: string;
  expectedSearchResultIds?: string[];
  searchEvaluationK?: number;
}

export interface EvalFixture {
  name: string;
  evaluationKind: EvaluationKind;
  questions: EvalQuestion[];
  corpus: string;
}

export interface EvalCondition {
  name: string;
  mode: "without-tools" | "with-tools";
  toolChoice?: "auto" | "required";
}

export interface ModelEntry {
  id: string;
  displayName?: string;
}

export interface ExperimentConfig {
  name: string;
  evals: string[];
  models: ModelEntry[];
  runs: number;
  conditions: EvalCondition[];
  baseUrl?: string;
  smokeQuestionLimit?: number;
  judgeModel?: string;
}

export interface RunExperimentOptions {
  debug?: boolean;
  dry?: boolean;
  modelFilter?: string[];
  conditionFilter?: string[];
  questionLimitOverride?: number;
}

export interface EvalRunRow {
  questionId: string;
  condition: string;
  model: string;
  run: number;
  answer: string;
  correct: boolean;
  matchKind: MatchKind;
  toolCalls: number;
  toolTrace?: string[];
  toolCorrect?: boolean;
  latencyMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  toolSequence?: string[];
  redundantToolCalls?: number;
  workflowCorrect?: boolean;
  safetyCorrect?: boolean;
  searchPrecisionAtK?: number;
  searchRecallAtK?: number;
  searchMrr?: number;
}

export interface PerModelResult {
  model: string;
  condition: string;
  accuracy: number;
  toolUsageRate: number;
  exactMatches: number;
  aliasMatches: number;
  wrongMatches: number;
  refusalMatches?: number;
  toolSelectionAccuracy?: number;
  unnecessaryToolCalls?: number;
  averageLatencyMs?: number;
  medianLatencyMs?: number;
  averageTotalTokens?: number;
  totalToolCalls?: number;
  redundantToolCallRate?: number;
  workflowAccuracy?: number;
  safetyAccuracy?: number;
  averagePrecisionAtK?: number;
  averageRecallAtK?: number;
  averageMrr?: number;
  costPerCorrectAnswer?: number;
  classBreakdown?: PerQuestionClassSummary[];
}

export interface PerQuestionClassSummary {
  questionClass: string;
  accuracy: number;
  toolUsageRate: number;
  averageLatencyMs?: number;
  averageTotalTokens?: number;
  unnecessaryToolCalls?: number;
  accuracyDeltaVsWithoutTools?: number;
}

export interface ExperimentSummary {
  experimentName: string;
  timestamp: string;
  durationMs: number;
  models: PerModelResult[];
}
