import type * as rdfjs from "@rdfjs/types";
import { Parser } from "n3";
import { hashQuad } from "../src/client/quad-store/hash-quad.ts";

interface SearchQualityQuestion {
  id: string;
  expectedSearchResultIds?: string[];
}

function createLegacySearchFixtureKey(quad: rdfjs.Quad): string {
  return `${quad.subject.value}|${quad.predicate.value}|${quad.object.value}|${quad.graph.value}`;
}

function looksLikeLegacySearchKey(value: string): boolean {
  return value.includes("|");
}

async function main(): Promise<void> {
  const corpusPath = new URL(
    "../evals/search-quality/corpus.ttl",
    import.meta.url,
  );
  const questionsPath = new URL(
    "../evals/search-quality/questions.json",
    import.meta.url,
  );

  const corpusText = await Deno.readTextFile(corpusPath);
  const parser = new Parser({ format: "text/turtle" });
  const parsedQuads = parser.parse(corpusText);

  const quadLookup = new Map<string, rdfjs.Quad>();
  for (const quad of parsedQuads) {
    const legacySearchFixtureKey = createLegacySearchFixtureKey(quad);
    if (quadLookup.has(legacySearchFixtureKey)) {
      throw new Error(
        `Duplicate legacy search fixture key in corpus: ${legacySearchFixtureKey}`,
      );
    }
    quadLookup.set(legacySearchFixtureKey, quad);
  }

  const questions = JSON.parse(
    await Deno.readTextFile(questionsPath),
  ) as SearchQualityQuestion[];

  for (const question of questions) {
    if (!Array.isArray(question.expectedSearchResultIds)) {
      continue;
    }

    const normalizedSearchResultIds: string[] = [];
    for (const searchResultId of question.expectedSearchResultIds) {
      if (!looksLikeLegacySearchKey(searchResultId)) {
        throw new Error(
          `Question ${question.id} contains a non-legacy expectedSearchResultIds entry. Refusing mixed-format normalization: ${searchResultId}`,
        );
      }

      const matchingQuad = quadLookup.get(searchResultId);
      if (!matchingQuad) {
        throw new Error(
          `Question ${question.id} references unknown legacy search fixture key: ${searchResultId}`,
        );
      }

      normalizedSearchResultIds.push(await hashQuad(matchingQuad));
    }

    question.expectedSearchResultIds = normalizedSearchResultIds;
  }

  await Deno.writeTextFile(
    questionsPath,
    `${JSON.stringify(questions, null, 2)}\n`,
  );
}

if (import.meta.main) {
  await main();
}
