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

export function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function matchesStandalonePhrase(answer: string, expectedPhrase: string): boolean {
  const normalizedAnswer = normalizeText(answer);
  const normalizedExpectedPhrase = normalizeText(expectedPhrase);
  return normalizedExpectedPhrase.length > 0 &&
    (` ${normalizedAnswer} `).includes(` ${normalizedExpectedPhrase} `);
}

export function assessAnswer(
  answer: string,
  expectedAnswer: string,
  aliases: string[] = [],
): BenchmarkAssessment {
  if (matchesStandalonePhrase(answer, expectedAnswer)) {
    return { correct: true, matchKind: "exact" };
  }

  for (const alias of aliases) {
    if (matchesStandalonePhrase(answer, alias)) {
      return { correct: true, matchKind: "alias" };
    }
  }

  return { correct: false, matchKind: "wrong" };
}
