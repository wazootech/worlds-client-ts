import { createClient } from "@libsql/client";
import { QueryEngine } from "@comunica/query-sparql-rdfjs-lite";
import {
  createLibsqlN3Client,
  hydrateStoreFromLibsql,
} from "@worlds/client/adapters/libsql-n3";
import { createLibsqlN3ComunicaClient } from "@worlds/client/adapters/libsql-n3/comunica";
import type { Client } from "@worlds/client";
import { DataFactory, Store } from "n3";

const { quad, namedNode, literal } = DataFactory;

/** warmSubjectIri is the entity hydrated once and queried across simulated requests. */
const warmSubjectIri = "urn:demo:warm:entity:0";

const databaseClient = createClient({ url: ":memory:" });
const queryEngine = new QueryEngine();

/** warmIsolateClient is built once after hydration — not per HTTP request. */
let warmIsolateClient: Client | undefined;

async function getWarmIsolateClient(warmedStore: Store): Promise<Client> {
  warmIsolateClient ??= await createLibsqlN3ComunicaClient({
    client: databaseClient,
    store: warmedStore,
    queryEngine,
  });
  return warmIsolateClient as Client;
}

if (import.meta.main) {
  const bootClient = await createLibsqlN3Client({ client: databaseClient });
  await bootClient.import({
    source: {
      kind: "quads",
      quads: [
        quad(
          namedNode(warmSubjectIri),
          namedNode("urn:demo:warm:predicate"),
          literal("Hydrate once per container; reuse store on each request."),
        ),
      ],
    },
    mode: "merge",
  });

  console.log("Container boot: single hydration into N3...");
  const warmedStore = new Store();
  const hydratedQuadCount = await hydrateStoreFromLibsql(
    databaseClient,
    warmedStore,
  );
  console.log(`Hydrated ${hydratedQuadCount} quad(s) into reused store.`);

  console.log("\nSimulated request 1 (reuse warm-isolate client):");
  const firstRequestClient = await getWarmIsolateClient(warmedStore);
  const firstResponse = await firstRequestClient.sparql({
    query:
      `SELECT ?property ?object WHERE { <${warmSubjectIri}> ?property ?object }`,
  });
  console.log(JSON.stringify(firstResponse, null, 2));

  console.log("\nSimulated request 2 (same warmed store + client):");
  const secondRequestClient = await getWarmIsolateClient(warmedStore);
  const secondResponse = await secondRequestClient.sparql({
    query:
      `SELECT ?property ?object WHERE { <${warmSubjectIri}> ?property ?object }`,
  });
  console.log(JSON.stringify(secondResponse, null, 2));
}
