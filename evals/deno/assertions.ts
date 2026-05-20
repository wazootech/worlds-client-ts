import type { EvalAssertionResult, EvalCaseResult } from "./types.ts";

/** assertUsedRequiredTools verifies that both phase-one tools were called. */
function assertUsedRequiredTools(result: EvalCaseResult): EvalAssertionResult {
  const toolNames = result.metadata.trajectory.map((record) => record.toolName);
  const pass = toolNames.includes("searchWorld") &&
    toolNames.includes("executeSparql");
  return {
    name: "used-required-tools",
    pass,
    message: pass ? undefined : `Observed tools: ${toolNames.join(", ")}`,
  };
}

/** assertSearchBeforeSparql ensures discovery happens before graph traversal. */
function assertSearchBeforeSparql(result: EvalCaseResult): EvalAssertionResult {
  const searchIndex = result.metadata.trajectory.findIndex((record) =>
    record.toolName === "searchWorld"
  );
  const sparqlIndex = result.metadata.trajectory.findIndex((record) =>
    record.toolName === "executeSparql"
  );
  const pass = searchIndex !== -1 && sparqlIndex !== -1 &&
    searchIndex < sparqlIndex;
  return {
    name: "search-before-sparql",
    pass,
    message: pass
      ? undefined
      : `searchIndex=${searchIndex}, sparqlIndex=${sparqlIndex}`,
  };
}

/** assertSparqlHandoffValid checks that the discovered subject flows into SPARQL. */
function assertSparqlHandoffValid(result: EvalCaseResult): EvalAssertionResult {
  const searchStep = result.metadata.trajectory.find((record) =>
    record.toolName === "searchWorld"
  );
  const sparqlStep = result.metadata.trajectory.find((record) =>
    record.toolName === "executeSparql"
  );
  const searchResult = JSON.stringify(searchStep?.result ?? {});
  const sparqlInput = JSON.stringify(sparqlStep?.args ?? {});
  const pass = searchResult.includes("HarryPotter") &&
    sparqlInput.includes("HarryPotter");
  return {
    name: "sparql-handoff-valid",
    pass,
  };
}

/** assertStepCountBounded verifies the agent stayed within the scenario limit. */
function assertStepCountBounded(
  result: EvalCaseResult,
  maxSteps: number,
): EvalAssertionResult {
  const pass = result.metadata.stepCount <= maxSteps;
  return {
    name: "step-count-bounded",
    pass,
    message: pass ? undefined : `Observed ${result.metadata.stepCount} steps`,
  };
}

/** assertFinalAnswerCorrect validates the seeded happy-path answer. */
function assertFinalAnswerCorrect(result: EvalCaseResult): EvalAssertionResult {
  const pass = result.output.includes("Gryffindor");
  return {
    name: "final-answer-correct",
    pass,
  };
}

/** assertUpdatesBlocked verifies the update guard produced the expected error. */
function assertUpdatesBlocked(result: EvalCaseResult): EvalAssertionResult {
  const pass = result.metadata.trajectory.some((record) =>
    record.toolName === "executeSparql" &&
    JSON.stringify(record.result ?? {}).includes(
      "Only read-only SPARQL queries are allowed",
    )
  );
  return {
    name: "updates-blocked",
    pass,
  };
}

/** applyAssertions runs the deterministic checks for one evaluation result. */
export function applyAssertions(result: EvalCaseResult): EvalCaseResult {
  const assertions: EvalAssertionResult[] = [];

  switch (result.id) {
    case "happy-path-search-then-sparql":
      assertions.push(assertUsedRequiredTools(result));
      assertions.push(assertSearchBeforeSparql(result));
      assertions.push(assertSparqlHandoffValid(result));
      assertions.push(assertStepCountBounded(result, 5));
      assertions.push(assertFinalAnswerCorrect(result));
      break;
    case "sparql-updates-blocked":
      assertions.push(assertUpdatesBlocked(result));
      assertions.push(assertStepCountBounded(result, 5));
      break;
    case "avoid-excessive-tool-loops":
      assertions.push(assertUsedRequiredTools(result));
      assertions.push(assertStepCountBounded(result, 4));
      break;
    default:
      assertions.push({
        name: "recognized-case-id",
        pass: false,
        message: `No assertion plan registered for case id: ${result.id}`,
      });
      break;
  }

  const success = result.success &&
    assertions.every((assertion) => assertion.pass);
  return {
    ...result,
    success,
    assertions,
  };
}
