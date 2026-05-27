import { createClient } from "@libsql/client";
import { QueryEngine } from "@comunica/query-sparql-rdfjs-lite";
import { Client } from "@worlds/client";
import { createComunicaLibsqlSparqlEngineFactory } from "@worlds/client/adapters/comunica";
import { createLibsqlAdapter } from "@worlds/client/adapters/libsql";
import { DataFactory } from "n3";

const { quad, namedNode, literal } = DataFactory;

/** warmSubjectIri is the entity queried across simulated serverless requests. */
const warmSubjectIri = "urn:demo:warm:hexastore:0";

const databaseClient = createClient({ url: ":memory:" });
const queryEngine = new QueryEngine();

/** warmIsolateClient survives warm isolates (Deno Deploy, Vercel Edge, etc.). */
let warmIsolateClient: Client | undefined;

async function getWarmIsolateClient(): Promise<Client> {
  warmIsolateClient ??= new Client(
    await createLibsqlAdapter({
      client: databaseClient,
      createSparqlEngine: createComunicaLibsqlSparqlEngineFactory({
        queryEngine,
      }),
    }),
  );
  return warmIsolateClient;
}

if (import.meta.main) {
  const seedClient = await getWarmIsolateClient();
  await seedClient.import({
    source: {
      kind: "quads",
      quads: [
        quad(
          namedNode(warmSubjectIri),
          namedNode("urn:demo:warm:predicate"),
          literal("Hexastore path: one client per warm isolate."),
        ),
      ],
    },
    mode: "merge",
  });

  console.log("Simulated request 1 (reuse warm-isolate client):");
  const firstClient = await getWarmIsolateClient();
  const firstResponse = await firstClient.sparql({
    query:
      `SELECT ?property ?object WHERE { <${warmSubjectIri}> ?property ?object }`,
  });
  console.log(JSON.stringify(firstResponse, null, 2));

  console.log("\nSimulated request 2 (same module-scoped client):");
  const secondClient = await getWarmIsolateClient();
  const secondResponse = await secondClient.sparql({
    query:
      `SELECT ?property ?object WHERE { <${warmSubjectIri}> ?property ?object }`,
  });
  console.log(JSON.stringify(secondResponse, null, 2));
}
