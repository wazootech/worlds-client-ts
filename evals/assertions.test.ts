import { assertEquals, assertFalse } from "@std/assert";
import {
  applyAssertions,
  assertOutputExcludesLiteral,
  extractSearchSubjects,
  extractSparqlBindingLiterals,
} from "./assertions.ts";
import type { EvalCaseResult, EvalToolRecord } from "./types.ts";
import {
  AUTHOR_LITERAL,
  DISTRACTOR_EXPECTED_HOUSE_LITERAL,
  EXPECTED_HOUSE_LITERAL,
  WORK_SUBJECT_URI,
} from "./world-fixture.ts";

/** createEvalCaseResult builds a minimal case result for assertion routing tests. */
function createEvalCaseResult(
  overrides: Partial<EvalCaseResult> & Pick<EvalCaseResult, "id">,
): EvalCaseResult {
  return {
    description: overrides.description ?? overrides.id,
    prompt: overrides.prompt ?? "",
    output: overrides.output ?? "",
    success: overrides.success ?? true,
    metadata: {
      providerId: "google",
      modelId: "gemini-3.1-flash-lite",
      stepCount: overrides.metadata?.stepCount ?? 2,
      latencyMs: overrides.metadata?.latencyMs ?? 0,
      trajectory: overrides.metadata?.trajectory ?? [],
      ...overrides.metadata,
    },
    assertions: [],
    toolSequence: [],
    ...overrides,
  };
}

/** createPassingHappyPathTrajectory returns a trajectory that satisfies happy-path assertions. */
function createPassingHappyPathTrajectory(): EvalToolRecord[] {
  return [
    {
      stepIndex: 0,
      toolName: "searchWorld",
      args: { query: "q7Xm9pRw" },
      result: {
        success: true,
        results: [{ subject: WORK_SUBJECT_URI }],
      },
    },
    {
      stepIndex: 1,
      toolName: "executeSparql",
      args: {
        query: `SELECT ?house WHERE { <${WORK_SUBJECT_URI}> ?p ?o }`,
      },
      result: {
        success: true,
        data: {
          results: {
            bindings: [{
              house: { type: "literal", value: EXPECTED_HOUSE_LITERAL },
            }],
          },
        },
      },
    },
  ];
}

const CASE_ASSERTION_NAMES: Record<string, string[]> = {
  "happy-path-search-then-sparql": [
    "used-required-tools",
    "search-before-sparql",
    "sparql-handoff-valid",
    "step-count-bounded",
    "sparql-answer-grounded",
    "final-answer-correct",
  ],
  "sparql-updates-blocked": ["updates-blocked", "step-count-bounded"],
  "avoid-excessive-tool-loops": [
    "used-required-tools",
    "step-count-bounded",
    "sparql-answer-grounded",
    "final-answer-correct",
  ],
  "discovery-efficient-search-then-sparql": [
    "used-required-tools",
    "search-before-sparql",
    "sparql-handoff-valid",
    "step-count-bounded",
    "sparql-answer-grounded",
    "final-answer-correct",
  ],
  "distractor-work-disambiguation": [
    "used-required-tools",
    "search-before-sparql",
    "sparql-handoff-valid",
    "sparql-answer-grounded",
    "final-answer-correct",
    "not-distractor-house",
  ],
  "search-miss-unknown-label": [
    "does-not-invent-house",
    "search-miss-no-grounded-success",
    "step-count-bounded",
  ],
  "sparql-delete-blocked": ["updates-blocked", "step-count-bounded"],
  "alternate-question-author": [
    "used-required-tools",
    "search-before-sparql",
    "sparql-handoff-valid",
    "step-count-bounded",
    "final-answer-author-correct",
  ],
  "no-tool-shortcut-resisted": ["used-required-tools", "step-count-bounded"],
};

for (
  const [caseId, expectedAssertionNames] of Object.entries(
    CASE_ASSERTION_NAMES,
  )
) {
  Deno.test(`applyAssertions routes ${caseId} to the expected assertion set`, () => {
    const trajectory = caseId === "sparql-updates-blocked" ||
        caseId === "sparql-delete-blocked"
      ? [{
        stepIndex: 0,
        toolName: "executeSparql",
        args: {
          query: caseId === "sparql-delete-blocked"
            ? "DELETE WHERE { ?s ?p ?o }"
            : "INSERT { ?s ?p ?o } WHERE {}",
        },
        result: {
          success: false,
          error: "Only read-only SPARQL queries are allowed for this agent.",
        },
      }]
      : caseId === "search-miss-unknown-label"
      ? [{
        stepIndex: 0,
        toolName: "searchWorld",
        args: { query: "z9Qk4WnP" },
        result: { success: true, results: [] },
      }]
      : createPassingHappyPathTrajectory();

    const output = caseId === "sparql-updates-blocked" ||
        caseId === "sparql-delete-blocked"
      ? ""
      : caseId === "alternate-question-author"
      ? `Author: ${AUTHOR_LITERAL}`
      : caseId === "search-miss-unknown-label"
      ? "No matching work was found in the graph."
      : `The house is ${EXPECTED_HOUSE_LITERAL}.`;

    const result = applyAssertions(createEvalCaseResult({
      id: caseId,
      output,
      metadata: {
        providerId: "google",
        modelId: "gemini-3.1-flash-lite",
        stepCount: trajectory.length,
        latencyMs: 0,
        trajectory,
      },
    }));

    assertEquals(
      result.assertions.map((assertion) => assertion.name),
      expectedAssertionNames,
    );
    assertEquals(result.success, true);
  });
}

Deno.test("applyAssertions fails unknown case ids with recognized-case-id", () => {
  const result = applyAssertions(createEvalCaseResult({
    id: "unknown-eval-case",
    metadata: {
      providerId: "google",
      modelId: "gemini-3.1-flash-lite",
      stepCount: 0,
      latencyMs: 0,
      trajectory: [],
    },
  }));

  assertEquals(result.assertions.length, 1);
  assertEquals(result.assertions[0].name, "recognized-case-id");
  assertFalse(result.assertions[0].pass);
  assertFalse(result.success);
});

Deno.test("applyAssertions clears success when a routed assertion fails", () => {
  const result = applyAssertions(createEvalCaseResult({
    id: "happy-path-search-then-sparql",
    output: "no house literal here",
    metadata: {
      providerId: "google",
      modelId: "gemini-3.1-flash-lite",
      stepCount: 2,
      latencyMs: 0,
      trajectory: createPassingHappyPathTrajectory(),
    },
  }));

  assertFalse(result.success);
  assertFalse(
    result.assertions.find((assertion) =>
      assertion.name === "final-answer-correct"
    )?.pass,
  );
});

Deno.test("extractSearchSubjects collects subject IRIs from searchWorld results", () => {
  const subjects = extractSearchSubjects({
    success: true,
    results: [
      { subject: WORK_SUBJECT_URI },
      { subject: "https://example.org/other" },
      { notASubject: true },
    ],
  });

  assertEquals(subjects, [
    WORK_SUBJECT_URI,
    "https://example.org/other",
  ]);
});

Deno.test("extractSearchSubjects returns empty array for malformed input", () => {
  assertEquals(extractSearchSubjects(null), []);
  assertEquals(extractSearchSubjects({}), []);
  assertEquals(extractSearchSubjects({ results: "not-an-array" }), []);
  assertEquals(extractSearchSubjects({ results: [{ subject: 42 }] }), []);
});

Deno.test("extractSparqlBindingLiterals collects literal binding values", () => {
  const literals = extractSparqlBindingLiterals({
    success: true,
    data: {
      results: {
        bindings: [
          {
            house: { type: "literal", value: EXPECTED_HOUSE_LITERAL },
            work: {
              type: "uri",
              value: WORK_SUBJECT_URI,
            },
          },
          {
            label: { value: "untagged-literal" },
          },
        ],
      },
    },
  });

  assertEquals(literals, [EXPECTED_HOUSE_LITERAL, "untagged-literal"]);
});

Deno.test("extractSparqlBindingLiterals returns empty array for failed or missing data", () => {
  assertEquals(extractSparqlBindingLiterals({ success: false }), []);
  assertEquals(extractSparqlBindingLiterals({ success: true, data: null }), []);
  assertEquals(extractSparqlBindingLiterals("not-an-object"), []);
});

Deno.test("assertOutputExcludesLiteral rejects output containing forbidden literal", () => {
  const result = createEvalCaseResult({
    id: "search-miss-unknown-label",
    output: `House: ${EXPECTED_HOUSE_LITERAL}`,
  });

  const assertion = assertOutputExcludesLiteral(
    result,
    EXPECTED_HOUSE_LITERAL,
    "does-not-invent-house",
  );

  assertFalse(assertion.pass);
});

Deno.test("applyAssertions search-miss fails when model invents the house literal", () => {
  const result = applyAssertions(createEvalCaseResult({
    id: "search-miss-unknown-label",
    output: `The house is ${EXPECTED_HOUSE_LITERAL}.`,
    metadata: {
      providerId: "google",
      modelId: "gemini-3.1-flash-lite",
      stepCount: 2,
      latencyMs: 0,
      trajectory: createPassingHappyPathTrajectory(),
    },
  }));

  assertFalse(result.success);
  assertFalse(
    result.assertions.find((assertion) =>
      assertion.name === "does-not-invent-house"
    )?.pass,
  );
});

Deno.test("applyAssertions not-distractor-house rejects distractor literal in output", () => {
  const result = applyAssertions(createEvalCaseResult({
    id: "distractor-work-disambiguation",
    output: `House: ${DISTRACTOR_EXPECTED_HOUSE_LITERAL}`,
    metadata: {
      providerId: "google",
      modelId: "gemini-3.1-flash-lite",
      stepCount: 2,
      latencyMs: 0,
      trajectory: createPassingHappyPathTrajectory(),
    },
  }));

  assertFalse(
    result.assertions.find((assertion) =>
      assertion.name === "not-distractor-house"
    )?.pass,
  );
  assertFalse(result.success);
});
