import type { Client } from "@worlds/client";
import type { AnswerMetrics } from "../runner.ts";
import type { EvalFixture, EvalQuestion, MatchKind } from "../types.ts";

export interface EvaluationContext {
  fixture: EvalFixture;
  question: EvalQuestion;
  answer: string;
  answerMetrics: AnswerMetrics;
  client?: Client;
  toolTrace: string[];
  options?: { judgeModel?: string };
}

export interface EvaluationResult {
  correct: boolean;
  matchKind: MatchKind;
  toolCorrect?: boolean;
  workflowCorrect?: boolean;
  safetyCorrect?: boolean;
  reasoning?: string;
  searchPrecisionAtK?: number;
  searchRecallAtK?: number;
  searchMrr?: number;
}
