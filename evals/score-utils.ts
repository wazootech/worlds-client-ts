import type { MatchKind } from "./types.ts";

export interface BenchmarkAssessment {
  correct: boolean;
  matchKind: MatchKind;
}

const REFUSAL_MARKERS = [
  "do not have direct",
  "dont have direct",
  "not based on my",
  "could not find any",
  "couldnt find any",
  "does not provide enough",
  "doesnt provide enough",
  "no direct information",
  "not able to specify",
  "fictional or hypothetical",
  "unable to determine",
  "i am not aware",
  "do not have information",
  "dont have information",
  "do not have access",
  "dont have access",
  "cannot answer",
  "cant answer",
  "cannot determine",
  "cant determine",
  "cannot provide",
  "cant provide",
  "will not be able",
  "wont be able",
  "cannot find this",
  "cant find this",
  "cannot find the",
  "cant find the",
];

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .join(" ");
}

export function isRefusal(normalizedAnswer: string): boolean {
  return REFUSAL_MARKERS.some((marker) => normalizedAnswer.includes(marker));
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function phraseContainedIn(answer: string, expectedPhrase: string): boolean {
  const normalizedAnswer = normalizeText(answer);
  const normalizedExpectedPhrase = normalizeText(expectedPhrase);

  if (normalizedExpectedPhrase.length === 0) return false;
  if (isRefusal(normalizedAnswer)) return false;

  const wordBoundaryPattern = new RegExp(
    `\\b${escapeRegex(normalizedExpectedPhrase)}\\b`,
  );
  return wordBoundaryPattern.test(normalizedAnswer);
}

export function assessAnswer(
  answer: string,
  expectedAnswer: string,
  aliases: string[] = [],
): BenchmarkAssessment {
  if (phraseContainedIn(answer, expectedAnswer)) {
    return { correct: true, matchKind: "exact" };
  }

  for (const alias of aliases) {
    if (phraseContainedIn(answer, alias)) {
      return { correct: true, matchKind: "alias" };
    }
  }

  return { correct: false, matchKind: "wrong" };
}

export function assessRefusal(
  answer: string,
): BenchmarkAssessment {
  const normalizedAnswer = normalizeText(answer);
  if (isRefusal(normalizedAnswer)) {
    return { correct: true, matchKind: "refusal" };
  }
  return { correct: false, matchKind: "wrong" };
}
