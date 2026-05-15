import type { EvalFixture, EvalQuestion } from "../types.ts";
import questions from "./questions.json" with { type: "json" };

const corpusUrl = new URL("./corpus.ttl", import.meta.url);
const corpus = Deno.readTextFileSync(corpusUrl);

const fixture: EvalFixture = {
  name: "search-quality",
  evaluationKind: "retrieval",
  questions: questions as EvalQuestion[],
  corpus,
};

export default fixture;
