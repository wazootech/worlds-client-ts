import { createClient } from "@libsql/client";
import { QueryEngine } from "@comunica/query-sparql-rdfjs-lite";
import { createLibsqlN3ComunicaClient } from "@worlds/client/adapters/libsql-n3/comunica";
import { DataFactory } from "n3";

const { quad, namedNode, literal } = DataFactory;

/** demoSubjectIri is the entity queried after a single hydration at process boot. */
const demoSubjectIri = "urn:demo:long-running:entity:0";

/**
 * Long-running service with N3 hydrate path: hydrate once at boot, hold one Client
 * for the process lifetime ([#68](https://github.com/wazootech/worlds-client-ts/issues/68)).
 */
if (import.meta.main) {
  const databaseClient = createClient({ url: ":memory:" });
  const queryEngine = new QueryEngine();

  console.log(
    "Boot: hydrate LibSQL into N3 and wire client (process lifetime)...",
  );
  const client = await createLibsqlN3ComunicaClient({
    client: databaseClient,
    queryEngine,
  });

  await client.import({
    source: {
      kind: "quads",
      quads: [
        quad(
          namedNode(demoSubjectIri),
          namedNode("urn:demo:long-running:predicate"),
          literal("One hydration at boot; reuse client for all requests."),
        ),
      ],
    },
    mode: "merge",
  });

  console.log("\nSubject-bound SPARQL (same client, no re-hydration):");
  const sparqlResponse = await client.sparql({
    query:
      `SELECT ?property ?object WHERE { <${demoSubjectIri}> ?property ?object }`,
  });
  console.log(JSON.stringify(sparqlResponse, null, 2));
}
