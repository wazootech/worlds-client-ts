import type { EvalQuestion, MatchKind } from "../types.ts";

export interface WorkflowAssessment {
  correct: boolean;
  matchKind: MatchKind;
  workflowCorrect: boolean;
}

export interface WorkflowScoringInput {
  question: EvalQuestion;
  toolSequence: string[];
  answer: string;
  graphCheckResults: boolean[];
}

function includesOrderedTools(
  observedToolSequence: string[],
  expectedToolSequence: string[],
): boolean {
  let searchIndex = 0;

  for (const expectedTool of expectedToolSequence) {
    const foundIndex = observedToolSequence.indexOf(expectedTool, searchIndex);
    if (foundIndex === -1) {
      return false;
    }
    searchIndex = foundIndex + 1;
  }

  return true;
}

export function scoreWorkflow(input: WorkflowScoringInput): WorkflowAssessment {
  const requiredTools = input.question.requiredTools ?? [];
  const forbiddenTools = input.question.forbiddenTools ?? [];
  const expectedToolsInOrder = input.question.expectedToolsInOrder ?? [];

  const requiredToolsPresent = requiredTools.every((requiredTool) =>
    input.toolSequence.includes(requiredTool)
  );
  const forbiddenToolsAbsent = forbiddenTools.every((forbiddenTool) =>
    !input.toolSequence.includes(forbiddenTool)
  );
  const orderedToolsCorrect = expectedToolsInOrder.length === 0
    ? true
    : includesOrderedTools(input.toolSequence, expectedToolsInOrder);

  const graphChecksCorrect = input.question.expectedMutation === "none"
    ? input.graphCheckResults.every((graphCheckResult) =>
      graphCheckResult === false
    )
    : input.graphCheckResults.every((graphCheckResult) =>
      graphCheckResult === true
    );

  const workflowCorrect = requiredToolsPresent && forbiddenToolsAbsent &&
    orderedToolsCorrect &&
    graphChecksCorrect;

  return {
    correct: workflowCorrect,
    matchKind: workflowCorrect ? "exact" : "wrong",
    workflowCorrect,
  };
}
