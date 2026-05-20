import { assertEquals, assertFalse } from "@std/assert";
import { isReadOnlySparqlQuery } from "./tools.ts";

const READ_ONLY_QUERIES = [
  "SELECT ?s WHERE { ?s ?p ?o }",
  "  SELECT ?s WHERE { ?s ?p ?o }",
  "# plan comment\nSELECT ?s WHERE { ?s ?p ?o }",
  "ASK { ?s ?p ?o }",
  "ask { ?s a ?o }",
];

const MUTATING_OR_INVALID_QUERIES = [
  'INSERT DATA { <http://example.org/s> <http://example.org/p> "o" }',
  "DELETE WHERE { ?s ?p ?o }",
  "DROP ALL",
  "CLEAR GRAPH <http://example.org/g>",
  "LOAD <http://example.org/data>",
  "CREATE GRAPH <http://example.org/g>",
  "WITH <http://example.org/g> INSERT { ?s ?p ?o }",
  "COPY GRAPH <http://example.org/a> TO <http://example.org/b>",
  "MOVE GRAPH <http://example.org/a> TO <http://example.org/b>",
  "ADD GRAPH <http://example.org/a> TO <http://example.org/b>",
  "not a sparql query",
  "",
];

for (const query of READ_ONLY_QUERIES) {
  Deno.test(`isReadOnlySparqlQuery accepts read-only query: ${query.slice(0, 40)}`, () => {
    assertEquals(isReadOnlySparqlQuery(query), true);
  });
}

for (const query of MUTATING_OR_INVALID_QUERIES) {
  Deno.test(`isReadOnlySparqlQuery rejects mutating or invalid query: ${query.slice(0, 40)}`, () => {
    assertFalse(isReadOnlySparqlQuery(query));
  });
}
