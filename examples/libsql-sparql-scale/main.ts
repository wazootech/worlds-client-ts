import { createClient } from "@libsql/client";
import { QueryEngine } from "@comunica/query-sparql-rdfjs-lite";
import { Client } from "@worlds/client";
import { createLibsqlAdapter } from "@worlds/client/adapters/libsql";
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
    await createLibsqlAdapter({
      client: databaseClient,
      queryEngine,
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

  const selectiveSparqlQuery =
    `SELECT ?property ?object WHERE { <${exampleSubjectIri}> ?property ?object }`;
  console.log("Selective (production-style):", selectiveSparqlQuery);
  const selectiveResponse = await client.sparql({
    query: selectiveSparqlQuery,
  });
  console.log(JSON.stringify(selectiveResponse, null, 2));

  const devOnlyScanQuery =
    "SELECT ?subject ?property ?object WHERE { ?subject ?property ?object } LIMIT 100";
  console.log("\nCapped full scan (dev/small graphs only):", devOnlyScanQuery);
  const scanResponse = await client.sparql({ query: devOnlyScanQuery });
  console.log(JSON.stringify(scanResponse, null, 2));

  // (intentionally no warm-isolate N3 guidance; hexastore is the single LibSQL path)
}
