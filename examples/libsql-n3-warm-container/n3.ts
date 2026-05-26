import { createClient } from "@libsql/client";
import { QueryEngine } from "@comunica/query-sparql-rdfjs-lite";
import { createComunicaSparqlEngineFactory } from "@worlds/client/adapters/comunica";
import {
  createSubjectBoundPropertiesSparqlQuery,
  hydrateStoreFromLibsql,
} from "@worlds/client/adapters/libsql";
import { Client } from "@worlds/client";
import { createLibsqlN3Adapter } from "@worlds/client/adapters/libsql/n3";
import { DataFactory, Store } from "n3";

const { quad, namedNode, literal } = DataFactory;

/** warmSubjectIri is the entity hydrated once and queried across simulated requests. */
const warmSubjectIri = "urn:demo:warm:entity:0";

const databaseClient = createClient({ url: ":memory:" });
const queryEngine = new QueryEngine();

/** warmIsolateClient is built once after hydration — not per HTTP request. */
let warmIsolateClient: Client | undefined;

async function getWarmIsolateClient(warmedStore: Store): Promise<Client> {
  warmIsolateClient ??= new Client(
    await createLibsqlN3Adapter({
      client: databaseClient,
      store: warmedStore,
      createSparqlEngine: createComunicaSparqlEngineFactory({ queryEngine }),
    }),
  );
  return warmIsolateClient;
}

if (import.meta.main) {
  const bootClient = new Client(
    await createLibsqlN3Adapter({ client: databaseClient }),
  );
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
    query: createSubjectBoundPropertiesSparqlQuery(warmSubjectIri),
  });
  console.log(JSON.stringify(firstResponse, null, 2));

  console.log("\nSimulated request 2 (same warmed store + client):");
  const secondRequestClient = await getWarmIsolateClient(warmedStore);
  const secondResponse = await secondRequestClient.sparql({
    query: createSubjectBoundPropertiesSparqlQuery(warmSubjectIri),
  });
  console.log(JSON.stringify(secondResponse, null, 2));
}
