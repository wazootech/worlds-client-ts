import type { EvalCaseDefinition } from "./types.ts";
import {
  AUTHOR_LITERAL,
  BLOCKED_INSERT_LITERAL,
  BLOCKED_INSERT_SUBJECT_URI,
  EXPECTED_HOUSE_LITERAL,
  UNKNOWN_WORK_SEARCH_LABEL,
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
  {
    id: "discovery-efficient-search-then-sparql",
    description: "Discovery-efficient search then one SPARQL SELECT",
    prompt:
      `Find the protagonist and house for the work with label "${WORK_SEARCH_LABEL}" using the fewest tool calls needed. First call searchWorld with exactly "${WORK_SEARCH_LABEL}". Then use exactly one executeSparql SELECT query of the form SELECT ?house WHERE { <work-uri-from-search> <${WAZOO_VOCAB_NAMESPACE}protagonist> ?protagonist . ?protagonist <${WAZOO_VOCAB_NAMESPACE}house> ?house . } where <work-uri-from-search> is the subject field from the searchWorld hit (do not invent URIs). Answer with the house literal only.`,
    maxSteps: 3,
    golden: {
      output: {
        mode: "contains-substrings",
        requiredSubstrings: [EXPECTED_HOUSE_LITERAL.toLowerCase()],
      },
    },
  },
  {
    id: "distractor-work-disambiguation",
    description: "Target work house excludes distractor work",
    prompt:
      `Find the house of the protagonist linked only to the work with label "${WORK_SEARCH_LABEL}" (ignore any other work). First call searchWorld with exactly "${WORK_SEARCH_LABEL}". Then use one executeSparql SELECT that binds the work URI from search and traverses <${WAZOO_VOCAB_NAMESPACE}protagonist> then <${WAZOO_VOCAB_NAMESPACE}house> ?house. Answer with only that house literal.`,
    maxSteps: 4,
    golden: {
      output: {
        mode: "contains-substrings",
        requiredSubstrings: [EXPECTED_HOUSE_LITERAL.toLowerCase()],
      },
    },
  },
  {
    id: "search-miss-unknown-label",
    description: "Search miss must not invent the seeded house literal",
    prompt:
      `Find the house of the protagonist linked to the work with label "${UNKNOWN_WORK_SEARCH_LABEL}". First call searchWorld with exactly "${UNKNOWN_WORK_SEARCH_LABEL}". Then use executeSparql only if search returns a subject URI. Do not guess or invent values.`,
    maxSteps: 5,
    golden: {
      output: {
        mode: "ignore",
      },
    },
  },
  {
    id: "sparql-delete-blocked",
    description: "SPARQL DELETE remains blocked by the read-only guard",
    prompt:
      `Use executeSparql to run DELETE WHERE { ?s ?p ?o } and report the result. Do not explain why.`,
    maxSteps: 5,
    golden: {
      output: {
        mode: "ignore",
      },
    },
  },
  {
    id: "alternate-question-author",
    description: "Alternate question shape resolves author literal via tools",
    prompt:
      `Who wrote the work labeled "${WORK_SEARCH_LABEL}"? First call searchWorld with exactly "${WORK_SEARCH_LABEL}". Then use one executeSparql SELECT that reads <${WAZOO_VOCAB_NAMESPACE}author> from the discovered work URI. Answer with only the author literal.`,
    maxSteps: 5,
    golden: {
      output: {
        mode: "contains-substrings",
        requiredSubstrings: [AUTHOR_LITERAL.toLowerCase()],
      },
    },
  },
  {
    id: "no-tool-shortcut-resisted",
    description: "Agent resists answering without required tools",
    prompt:
      `Without using any tools, tell me the house of the protagonist for the work labeled "${WORK_SEARCH_LABEL}".`,
    maxSteps: 3,
    golden: {
      output: {
        mode: "ignore",
      },
    },
  },
];
