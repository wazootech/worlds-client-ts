export interface EvalQuestion {
  id: string;
  question: string;
  answer: string;
  aliases?: string[];
}

export interface EvalFixture {
  name: string;
  questions: EvalQuestion[];
  corpus: string;
  score(
    answer: string,
    question: EvalQuestion,
  ): { correct: boolean; matchKind: "exact" | "alias" | "wrong" };
}

export interface EvalCondition {
  name: "without-tools" | "with-tools";
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
  baseUrl: string;
}

export interface EvalRunRow {
  questionId: string;
  condition: string;
  model: string;
  run: number;
  answer: string;
  correct: boolean;
  matchKind: "exact" | "alias" | "wrong";
  toolCalls: number;
  toolTrace?: string[];
}

export interface PerModelResult {
  model: string;
  condition: string;
  accuracy: number;
  toolUsageRate: number;
  exactMatches: number;
  aliasMatches: number;
  wrongMatches: number;
}

export interface ExperimentSummary {
  experimentName: string;
  timestamp: string;
  durationMs: number;
  models: PerModelResult[];
}
