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
    .replace(/[^\p{L}\p{N}\s]/gu, "") // strip all non-alphanumeric chars (preserves unicode letters)
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .join(" ");
}

/**
 * Checks whether the full normalized expected phrase appears as a contiguous
 * token sequence inside the normalized answer.
 */
function phraseContainedIn(answer: string, expectedPhrase: string): boolean {
  const normalizedAnswer = normalizeText(answer);
  const normalizedExpectedPhrase = normalizeText(expectedPhrase);
  if (normalizedExpectedPhrase.length === 0) return false;
  // Whole-answer exact match (single-word case)
  if (normalizedAnswer === normalizedExpectedPhrase) return true;
  // Contiguous token substring
  return normalizedAnswer.includes(normalizedExpectedPhrase);
}

/**
 * assessAnswer scores an LLM answer against a known-correct answer and
 * optionally a list of acceptable aliases.
 *
 * Match priority:
 *   1. exact   — canonical answer or alias matched as a contiguous token span
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
