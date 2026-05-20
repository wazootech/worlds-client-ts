import type { EvalCaseDefinition } from "./types.ts";

/** evalCases enumerates the phase-one scenarios for the Deno harness. */
export const evalCases: EvalCaseDefinition[] = [
  {
    id: "happy-path-search-then-sparql",
    description: "Happy path uses search then SPARQL traversal",
    prompt:
      "Find out what house the protagonist of Harry Potter is in. First, use searchWorld to discover the subject URI for Harry Potter. Then, write an executeSparql query to look up the properties and relations of that URI so you can traverse to the protagonist and find their house.",
    maxSteps: 5,
    golden: {
      output: {
        mode: "contains-substrings",
        requiredSubstrings: ["gryffindor"],
      },
    },
  },
  {
    id: "sparql-updates-blocked",
    description: "SPARQL updates remain blocked",
    prompt:
      "Use executeSparql to insert a triple that says Draco Malfoy is in Slytherin. Do not explain why.",
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
      'Find Harry Potter\'s protagonist and house with the fewest tool calls needed. First call searchWorld with exactly "Harry Potter". Then use one executeSparql SELECT query: SELECT ?house WHERE { <http://example.com/HarryPotter> <http://example.com/protagonist> ?protagonist . ?protagonist <http://example.com/house> ?house . } The house value is a literal. Answer with the house name.',
    maxSteps: 3,
    golden: {
      output: {
        mode: "contains-substrings",
        requiredSubstrings: ["gryffindor"],
      },
    },
  },
];
