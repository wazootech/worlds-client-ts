export interface BenchmarkQuestion {
  id: string;
  question: string;
  answer: string;
  aliases?: string[];
}

export interface BenchmarkAssessment {
  correct: boolean;
  matchKind: "exact" | "alias" | "wrong";
}

/**
 * normalizeText lowercases and strips punctuation so matching is robust
 * across LLM answer variations.
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .join(" ");
}

/**
 * REFUSAL_MARKERS contains normalized phrases indicative of an LLM refusing to
 * answer due to a lack of factual knowledge, preventing accidental substring
 * matches on repeated question subjects.
 */
const REFUSAL_MARKERS = [
  "do not have direct",
  "not based on my",
  "could not find any",
  "does not provide enough",
  "no direct information",
  "not able to specify",
  "fictional or hypothetical",
  "unable to determine",
  "i am not aware",
  "do not have information",
  "do not have access",
];

/**
 * isRefusal checks whether the answer matches known LLM refusal signatures.
 */
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

/**
 * assessAnswer scores an LLM answer against a known-correct answer and
 * optionally a list of acceptable aliases.
 *
 * Match priority:
 *   1. exact   — canonical answer matched as a contiguous token span
 *   2. alias   — non-canonical alias matched
 *   3. wrong   — no match
 */
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
