import { assertEquals } from "@std/assert";

import {
  createCappedUnboundTriplePatternSparqlQuery,
  createSubjectBoundPropertiesSparqlQuery,
} from "./libsql-sparql-query-patterns.ts";

Deno.test(
  "createSubjectBoundPropertiesSparqlQuery - grounds subject in BGP",
  () => {
    const sparqlQuery = createSubjectBoundPropertiesSparqlQuery(
      "urn:entity:42",
    );
    assertEquals(
      sparqlQuery,
      "SELECT ?property ?object WHERE { <urn:entity:42> ?property ?object }",
    );
  },
);

Deno.test(
  "createCappedUnboundTriplePatternSparqlQuery - floors limit to at least 1",
  () => {
    assertEquals(
      createCappedUnboundTriplePatternSparqlQuery(0),
      "SELECT ?subject ?property ?object WHERE { ?subject ?property ?object } LIMIT 1",
    );
    assertEquals(
      createCappedUnboundTriplePatternSparqlQuery(100),
      "SELECT ?subject ?property ?object WHERE { ?subject ?property ?object } LIMIT 100",
    );
  },
);
