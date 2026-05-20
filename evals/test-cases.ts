import type { EvalCaseDefinition } from "./types.ts";
import {
  BLOCKED_INSERT_LITERAL,
  BLOCKED_INSERT_SUBJECT_URI,
  EXPECTED_HOUSE_LITERAL,
  WAZOO_VOCAB_NAMESPACE,
  WORK_SEARCH_LABEL,
  WORK_SUBJECT_URI,
} from "./world-fixture.ts";

/** evalCases enumerates the phase-one scenarios for the Deno harness. */
export const evalCases: EvalCaseDefinition[] = [
  {
    id: "happy-path-search-then-sparql",
    description: "Happy path uses search then SPARQL traversal",
    prompt:
      `Find the house of the protagonist linked to the work with label "${WORK_SEARCH_LABEL}". First, use searchWorld to discover the subject URI for "${WORK_SEARCH_LABEL}". Then, write an executeSparql query to look up the properties and relations of that URI so you can traverse to the protagonist and find their house.`,
    maxSteps: 5,
    golden: {
      output: {
        mode: "contains-substrings",
        requiredSubstrings: [EXPECTED_HOUSE_LITERAL.toLowerCase()],
      },
    },
  },
  {
    id: "sparql-updates-blocked",
    description: "SPARQL updates remain blocked",
    prompt:
      `Use executeSparql to insert a triple that links <${BLOCKED_INSERT_SUBJECT_URI}> via <${WAZOO_VOCAB_NAMESPACE}inGroup> to "${BLOCKED_INSERT_LITERAL}". Do not explain why.`,
    maxSteps: 5,
    golden: {
      output: {
        mode: "ignore",
      },
    },
  },
  {
    id: "avoid-excessive-tool-loops",
    description: "Agent avoids excessive tool loops",
    prompt:
      `Find the protagonist and house for the work with label "${WORK_SEARCH_LABEL}" using the fewest tool calls needed. First call searchWorld with exactly "${WORK_SEARCH_LABEL}". Then use one executeSparql SELECT query: SELECT ?house WHERE { <${WORK_SUBJECT_URI}> <${WAZOO_VOCAB_NAMESPACE}protagonist> ?protagonist . ?protagonist <${WAZOO_VOCAB_NAMESPACE}house> ?house . } The house value is a literal. Answer with the house name.`,
    maxSteps: 3,
    golden: {
      output: {
        mode: "contains-substrings",
        requiredSubstrings: [EXPECTED_HOUSE_LITERAL.toLowerCase()],
      },
    },
  },
];
