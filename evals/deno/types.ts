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

/** EvalCaseDefinition describes one agent evaluation scenario. */
export interface EvalCaseDefinition {
  description: string;
  prompt: string;
  maxSteps?: number;
}

/** EvalCaseResult stores the output and assertion results for one scenario. */
export interface EvalCaseResult {
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
