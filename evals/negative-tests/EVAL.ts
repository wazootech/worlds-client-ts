import type { EvalFixture, EvalQuestion } from "../types.ts";
import { scoreNegativeTest } from "./score.ts";
import questions from "./questions.json" with { type: "json" };

const corpusUrl = new URL("../recall/corpus.ttl", import.meta.url);
const corpus = Deno.readTextFileSync(corpusUrl);

function _score(answer: string, question: EvalQuestion) {
  const expectsRefusal = question.expectedOutcome === "refusal";
  return scoreNegativeTest(
    answer,
    question.answer,
    question.aliases,
    expectsRefusal,
  );
}

const fixture: EvalFixture = {
  name: "negative-tests",
  evaluationKind: "answer",
  questions: questions as EvalQuestion[],
  corpus,
};

export default fixture;
