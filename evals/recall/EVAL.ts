import type { EvalFixture, EvalQuestion } from "../types.ts";
import { assessAnswer } from "./score.ts";
import questions from "./questions.json" with { type: "json" };

const corpusUrl = new URL("./corpus.ttl", import.meta.url);
const corpus = Deno.readTextFileSync(corpusUrl);

function score(answer: string, question: EvalQuestion) {
  return assessAnswer(answer, question.answer, question.aliases);
}

const fixture: EvalFixture = {
  name: "recall",
  evaluationKind: "answer",
  questions: questions as EvalQuestion[],
  corpus,
};

export default fixture;
