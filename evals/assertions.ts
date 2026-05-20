import type { EvalAssertionResult, EvalCaseResult } from "./types.ts";
import {
  AUTHOR_LITERAL,
  DISTRACTOR_EXPECTED_HOUSE_LITERAL,
  EXPECTED_HOUSE_LITERAL,
} from "./world-fixture.ts";

/** normalizeOutputText canonicalizes free-form final text before tolerant comparison. */
function normalizeOutputText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

/** extractSearchSubjects collects subject IRIs from a searchWorld tool result. */
export function extractSearchSubjects(searchResult: unknown): string[] {
  if (
    typeof searchResult !== "object" || searchResult === null ||
    !("results" in searchResult)
  ) {
    return [];
  }

  const results = (searchResult as { results?: unknown }).results;
  if (!Array.isArray(results)) {
    return [];
  }

  const subjects: string[] = [];
  for (const hit of results) {
    if (
      typeof hit === "object" && hit !== null && "subject" in hit &&
      typeof (hit as { subject: unknown }).subject === "string"
    ) {
      subjects.push((hit as { subject: string }).subject);
    }
  }
  return subjects;
}

/** extractSparqlBindingLiterals collects literal values from a successful executeSparql result. */
export function extractSparqlBindingLiterals(sparqlResult: unknown): string[] {
  if (typeof sparqlResult !== "object" || sparqlResult === null) {
    return [];
  }

  const toolResult = sparqlResult as { success?: boolean; data?: unknown };
  if (!toolResult.success || toolResult.data === null) {
    return [];
  }

  if (typeof toolResult.data !== "object" || toolResult.data === null) {
    return [];
  }

  const bindings = (toolResult.data as {
    results?: { bindings?: Array<Record<string, unknown>> };
  }).results?.bindings;

  if (!Array.isArray(bindings)) {
    return [];
  }

  const literals: string[] = [];
  for (const binding of bindings) {
    for (const variable of Object.values(binding)) {
      if (
        typeof variable !== "object" || variable === null ||
        !("value" in variable) || typeof variable.value !== "string"
      ) {
        continue;
      }
      const bindingValue = variable as { type?: string; value: string };
      if (!bindingValue.type || bindingValue.type === "literal") {
        literals.push(bindingValue.value);
      }
    }
  }
  return literals;
}

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

/** assertSparqlHandoffValid checks that a discovered subject URI flows into SPARQL. */
function assertSparqlHandoffValid(result: EvalCaseResult): EvalAssertionResult {
  const searchStep = result.metadata.trajectory.find((record) =>
    record.toolName === "searchWorld"
  );
  const sparqlStep = result.metadata.trajectory.find((record) =>
    record.toolName === "executeSparql"
  );
  const discoveredSubjects = extractSearchSubjects(searchStep?.result);
  const sparqlInput = JSON.stringify(sparqlStep?.args ?? {});
  const pass = discoveredSubjects.length > 0 &&
    discoveredSubjects.some((subject) => sparqlInput.includes(subject));
  return {
    name: "sparql-handoff-valid",
    pass,
    message: pass
      ? undefined
      : discoveredSubjects.length === 0
      ? "searchWorld returned no subject URIs to hand off into SPARQL"
      : `Discovered subjects not found in first executeSparql args: ${
        discoveredSubjects.join(", ")
      }; SPARQL args: ${sparqlInput.slice(0, 200)}`,
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
  const normalizedOutput = normalizeOutputText(result.output);
  const expectedSubstring = normalizeOutputText(EXPECTED_HOUSE_LITERAL);
  const pass = normalizedOutput.includes(expectedSubstring);
  return {
    name: "final-answer-correct",
    pass,
    message: pass
      ? undefined
      : `Expected output to contain "${EXPECTED_HOUSE_LITERAL}"; got: ${
        result.output.slice(0, 200)
      }`,
  };
}

/** assertSparqlAnswerGrounded verifies the expected house literal appears in SPARQL bindings. */
function assertSparqlAnswerGrounded(
  result: EvalCaseResult,
  expectedLiteral: string = EXPECTED_HOUSE_LITERAL,
): EvalAssertionResult {
  const bindingLiterals = result.metadata.trajectory
    .filter((record) => record.toolName === "executeSparql")
    .flatMap((record) => extractSparqlBindingLiterals(record.result));

  const pass = bindingLiterals.includes(expectedLiteral);
  return {
    name: "sparql-answer-grounded",
    pass,
    message: pass
      ? undefined
      : `Expected executeSparql binding literal "${expectedLiteral}"; observed literals: ${
        bindingLiterals.length > 0 ? bindingLiterals.join(", ") : "(none)"
      }`,
  };
}

/** assertNotDistractorHouse verifies the final answer does not report the distractor house. */
function assertNotDistractorHouse(result: EvalCaseResult): EvalAssertionResult {
  const normalizedOutput = normalizeOutputText(result.output);
  const distractorSubstring = normalizeOutputText(
    DISTRACTOR_EXPECTED_HOUSE_LITERAL,
  );
  const pass = !normalizedOutput.includes(distractorSubstring);
  return {
    name: "not-distractor-house",
    pass,
    message: pass
      ? undefined
      : `Final answer must not contain distractor house "${DISTRACTOR_EXPECTED_HOUSE_LITERAL}"; got: ${
        result.output.slice(0, 200)
      }`,
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

/** assertOutputExcludesLiteral verifies the final answer does not contain a forbidden literal. */
export function assertOutputExcludesLiteral(
  result: EvalCaseResult,
  forbiddenLiteral: string,
  assertionName: string,
): EvalAssertionResult {
  const normalizedOutput = normalizeOutputText(result.output);
  const forbiddenSubstring = normalizeOutputText(forbiddenLiteral);
  const pass = !normalizedOutput.includes(forbiddenSubstring);
  return {
    name: assertionName,
    pass,
    message: pass
      ? undefined
      : `Final answer must not contain "${forbiddenLiteral}"; got: ${
        result.output.slice(0, 200)
      }`,
  };
}

/** assertSearchMissNoGroundedSuccess verifies the agent did not ground a happy-path house answer. */
function assertSearchMissNoGroundedSuccess(
  result: EvalCaseResult,
): EvalAssertionResult {
  const handoffResult = assertSparqlHandoffValid(result);
  const answerResult = assertFinalAnswerCorrect(result);
  const pass = !handoffResult.pass || !answerResult.pass;
  return {
    name: "search-miss-no-grounded-success",
    pass,
    message: pass
      ? undefined
      : "Search miss should fail handoff or final answer, but both assertions passed",
  };
}

/** assertFinalAnswerContainsLiteral validates that the final answer includes an expected literal. */
function assertFinalAnswerContainsLiteral(
  result: EvalCaseResult,
  expectedLiteral: string,
  assertionName: string,
): EvalAssertionResult {
  const normalizedOutput = normalizeOutputText(result.output);
  const expectedSubstring = normalizeOutputText(expectedLiteral);
  const pass = normalizedOutput.includes(expectedSubstring);
  return {
    name: assertionName,
    pass,
    message: pass
      ? undefined
      : `Expected output to contain "${expectedLiteral}"; got: ${
        result.output.slice(0, 200)
      }`,
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
      assertions.push(assertSparqlAnswerGrounded(result));
      assertions.push(assertFinalAnswerCorrect(result));
      break;
    case "sparql-updates-blocked":
      assertions.push(assertUpdatesBlocked(result));
      assertions.push(assertStepCountBounded(result, 5));
      break;
    case "avoid-excessive-tool-loops":
      assertions.push(assertUsedRequiredTools(result));
      assertions.push(assertStepCountBounded(result, 3));
      assertions.push(assertSparqlAnswerGrounded(result));
      assertions.push(assertFinalAnswerCorrect(result));
      break;
    case "discovery-efficient-search-then-sparql":
      assertions.push(assertUsedRequiredTools(result));
      assertions.push(assertSearchBeforeSparql(result));
      assertions.push(assertSparqlHandoffValid(result));
      assertions.push(assertStepCountBounded(result, 3));
      assertions.push(assertSparqlAnswerGrounded(result));
      assertions.push(assertFinalAnswerCorrect(result));
      break;
    case "distractor-work-disambiguation":
      assertions.push(assertUsedRequiredTools(result));
      assertions.push(assertSearchBeforeSparql(result));
      assertions.push(assertSparqlHandoffValid(result));
      assertions.push(assertSparqlAnswerGrounded(result));
      assertions.push(assertFinalAnswerCorrect(result));
      assertions.push(assertNotDistractorHouse(result));
      break;
    case "search-miss-unknown-label":
      assertions.push(
        assertOutputExcludesLiteral(
          result,
          EXPECTED_HOUSE_LITERAL,
          "does-not-invent-house",
        ),
      );
      assertions.push(assertSearchMissNoGroundedSuccess(result));
      assertions.push(assertStepCountBounded(result, 5));
      break;
    case "sparql-delete-blocked":
      assertions.push(assertUpdatesBlocked(result));
      assertions.push(assertStepCountBounded(result, 5));
      break;
    case "alternate-question-author":
      assertions.push(assertUsedRequiredTools(result));
      assertions.push(assertSearchBeforeSparql(result));
      assertions.push(assertSparqlHandoffValid(result));
      assertions.push(assertStepCountBounded(result, 5));
      assertions.push(
        assertFinalAnswerContainsLiteral(
          result,
          AUTHOR_LITERAL,
          "final-answer-author-correct",
        ),
      );
      break;
    case "no-tool-shortcut-resisted":
      assertions.push(assertUsedRequiredTools(result));
      assertions.push(assertStepCountBounded(result, 3));
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
