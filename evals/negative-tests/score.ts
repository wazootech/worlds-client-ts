import type { MatchKind } from "../types.ts";
import { assessAnswer, assessRefusal } from "../score-utils.ts";

export interface NegativeTestAssessment {
  correct: boolean;
  matchKind: MatchKind;
}

export function scoreNegativeTest(
  answer: string,
  expectedAnswer: string,
  aliases: string[] = [],
  isRefusalExpected: boolean = true,
): NegativeTestAssessment {
  if (!isRefusalExpected) {
    return assessAnswer(answer, expectedAnswer, aliases);
  }

  const refusalAssessment = assessRefusal(answer);
  if (refusalAssessment.correct) {
    return refusalAssessment;
  }

  return { correct: false, matchKind: "wrong" };
}
