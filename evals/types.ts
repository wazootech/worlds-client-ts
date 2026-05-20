/** EvalTokenUsage captures token accounting for a single agent run. */
export interface EvalTokenUsage {
  prompt?: number;
  completion?: number;
  total?: number;
}

/** EvalToolRecord stores one tool call and its corresponding output. */
export interface EvalToolRecord {
  stepIndex: number;
  toolName: string;
  args: unknown;
  result: unknown;
}

/** EvalRunMetadata collects execution details for one evaluation case. */
export interface EvalRunMetadata {
  providerId: string;
  modelId: string;
  stepCount: number;
  finishReason?: string;
  latencyMs: number;
  tokenUsage?: EvalTokenUsage;
  trajectory: EvalToolRecord[];
}

/** EvalAssertionResult reports whether a single assertion passed. */
export interface EvalAssertionResult {
  name: string;
  pass: boolean;
  message?: string;
}

/** EvalGoldenOutputComparison describes how a case compares final model output against its golden. */
export type EvalGoldenOutputComparison =
  | {
    mode: "ignore";
  }
  | {
    mode: "normalized-exact";
  }
  | {
    mode: "contains-substrings";
    requiredSubstrings: string[];
  };

/** EvalGoldenOptions defines per-case snapshot comparison behavior. */
export interface EvalGoldenOptions {
  output: EvalGoldenOutputComparison;
}

/** EvalCaseDefinition describes one agent evaluation scenario. */
export interface EvalCaseDefinition {
  id: string;
  description: string;
  prompt: string;
  maxSteps?: number;
  fixtureId?: string;
  golden: EvalGoldenOptions;
}

/** EvalCaseResult stores the output and assertion results for one scenario. */
export interface EvalCaseResult {
  id: string;
  description: string;
  prompt: string;
  output: string;
  success: boolean;
  metadata: EvalRunMetadata;
  assertions: EvalAssertionResult[];
  error?: string;
}

/** EvalSuiteResult represents one complete eval run across multiple cases. */
export interface EvalSuiteResult {
  providerId: string;
  modelId: string;
  timestamp: string;
  success: boolean;
  results: EvalCaseResult[];
}

/** EvalAssertionPassRate summarizes how often one assertion passed across trials. */
export interface EvalAssertionPassRate {
  name: string;
  passCount: number;
  trialCount: number;
  passRate: number;
}

/** EvalCasePassRate summarizes per-case success across trials. */
export interface EvalCasePassRate {
  id: string;
  description: string;
  passCount: number;
  trialCount: number;
  passRate: number;
  assertionPassRates: EvalAssertionPassRate[];
}

/** EvalStatsResult aggregates multi-trial behavioral reliability for selected cases. */
export interface EvalStatsResult {
  providerId: string;
  modelId: string;
  timestamp: string;
  trialCount: number;
  minPassRate?: number;
  success: boolean;
  casePassRates: EvalCasePassRate[];
}

/** GoldenEvalRunMetadata captures stable metadata suitable for committed snapshots. */
export interface GoldenEvalRunMetadata {
  providerId: string;
  modelId: string;
  stepCount: number;
  finishReason?: string;
  trajectory: EvalToolRecord[];
}

/** GoldenEvalCaseResult stores a sanitized, committed snapshot for one case. */
export interface GoldenEvalCaseResult {
  id: string;
  description: string;
  prompt: string;
  output: string;
  success: boolean;
  metadata: GoldenEvalRunMetadata;
  assertions: EvalAssertionResult[];
  error?: string;
}
