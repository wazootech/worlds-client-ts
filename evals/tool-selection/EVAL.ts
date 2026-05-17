import type { EvalFixture, EvalQuestion } from "../types.ts";
import { assessAnswer } from "./score.ts";
import questions from "./questions.json" with { type: "json" };

const corpusUrl = new URL("./corpus.ttl", import.meta.url);
const corpus = Deno.readTextFileSync(corpusUrl);

function _score(answer: string, question: EvalQuestion) {
  return assessAnswer(answer, question.answer, question.aliases);
}

const fixture: EvalFixture = {
  name: "tool-selection",
  evaluationKind: "answer",
  questions: questions as EvalQuestion[],
  corpus,
};

export default fixture;
