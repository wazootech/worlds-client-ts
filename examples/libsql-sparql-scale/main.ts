import { createClient } from "@libsql/client";
import { QueryEngine } from "@comunica/query-sparql-rdfjs-lite";
import { Client } from "@worlds/client";
import { ComunicaSparqlEngine } from "@worlds/client/adapters/comunica";
import {
  createCappedUnboundTriplePatternSparqlQuery,
  createLibsqlClientOptions,
  createSubjectBoundPropertiesSparqlQuery,
} from "@worlds/client/adapters/libsql";
import { DataFactory } from "n3";

const { quad, namedNode, literal } = DataFactory;

/** exampleSubjectIri is the grounded subject used for production-style SPARQL in this demo. */
const exampleSubjectIri = "urn:demo:entity:0";

/**
 * Demonstrates LibSQL hexastore SPARQL query shapes recommended at scale ([#68](https://github.com/wazootech/worlds-client-ts/issues/68)):
 * subject-bound selective queries on hexastore LibSQL, and why unbound `?s ?p ?o` scans are dev-only.
 */
if (import.meta.main) {
  const databaseClient = createClient({ url: ":memory:" });
  const queryEngine = new QueryEngine();

  const client = new Client(
    await createLibsqlClientOptions({
      client: databaseClient,
      createSparqlEngine: ({ libsqlStore }) =>
        new ComunicaSparqlEngine({ queryEngine, store: libsqlStore }),
    }),
  );

  await client.import({
    source: {
      kind: "quads",
      quads: [
        quad(
          namedNode(exampleSubjectIri),
          namedNode("urn:demo:predicate"),
          literal("Production paths bind at least one term in hot-path BGPs."),
        ),
        quad(
          namedNode("urn:demo:entity:1"),
          namedNode("urn:demo:predicate"),
          literal(
            "Other entities stay reachable via bound lookups, not full scans.",
          ),
        ),
      ],
    },
    mode: "merge",
  });

  const selectiveSparqlQuery = createSubjectBoundPropertiesSparqlQuery(
    exampleSubjectIri,
  );
  console.log("Selective (production-style):", selectiveSparqlQuery);
  const selectiveResponse = await client.sparql({
    query: selectiveSparqlQuery,
  });
  console.log(JSON.stringify(selectiveResponse, null, 2));

  const devOnlyScanQuery = createCappedUnboundTriplePatternSparqlQuery(100);
  console.log("\nCapped full scan (dev/small graphs only):", devOnlyScanQuery);
  const scanResponse = await client.sparql({ query: devOnlyScanQuery });
  console.log(JSON.stringify(scanResponse, null, 2));

  console.log(
    "\nFor warm isolates: deno task example:libsql-n3-warm-container:n3",
  );
}
