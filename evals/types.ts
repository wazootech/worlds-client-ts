export type MatchKind = "exact" | "alias" | "wrong" | "refusal";

export interface EvalQuestion {
  id: string;
  question: string;
  answer: string;
  aliases?: string[];
  expectedOutcome?: "factoid" | "refusal";
  expectedTool?: string | null;
  tags?: string[];
  scoringMode?: "code" | "llm";
}

export interface EvalFixture {
  name: string;
  questions: EvalQuestion[];
  corpus: string;
  score(
    answer: string,
    question: EvalQuestion,
  ): { correct: boolean; matchKind: MatchKind };
}

export interface EvalCondition {
  name: string;
  forceTools?: boolean;
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
}

export interface ExperimentSummary {
  experimentName: string;
  timestamp: string;
  durationMs: number;
  models: PerModelResult[];
}
