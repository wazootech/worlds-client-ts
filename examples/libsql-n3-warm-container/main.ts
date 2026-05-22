import { createClient } from "@libsql/client";
import { QueryEngine } from "@comunica/query-sparql-rdfjs-lite";
import { ComunicaSparqlEngine } from "@worlds/client/adapters/comunica";
import {
  createSubjectBoundPropertiesSparqlQuery,
  hydrateStoreFromLibsql,
} from "@worlds/client/adapters/libsql";
import { createLibsqlN3Client } from "@worlds/client/adapters/libsql/n3";
import { DataFactory, Store } from "n3";

const { quad, namedNode, literal } = DataFactory;

/** warmSubjectIri is the entity hydrated once and queried across simulated requests. */
const warmSubjectIri = "urn:demo:warm:entity:0";

/**
 * Simulates a container that hydrates LibSQL into N3 once, then reuses the same `store`
 * for every request ([#68](https://github.com/wazootech/worlds-client-ts/issues/68)).
 */
async function createRequestClient(
  databaseClient: ReturnType<typeof createClient>,
  warmedStore: Store,
) {
  return await createLibsqlN3Client({
    client: databaseClient,
    store: warmedStore,
    createSparqlEngine: ({ store }) =>
      new ComunicaSparqlEngine({
        queryEngine: new QueryEngine(),
        store,
      }),
  });
}

if (import.meta.main) {
  const databaseClient = createClient({ url: ":memory:" });

  const seedClient = await createLibsqlN3Client({ client: databaseClient });
  await seedClient.import({
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

  console.log("\nSimulated request 1 (no re-hydration):");
  const firstRequestClient = await createRequestClient(
    databaseClient,
    warmedStore,
  );
  const firstResponse = await firstRequestClient.sparql({
    query: createSubjectBoundPropertiesSparqlQuery(warmSubjectIri),
  });
  console.log(JSON.stringify(firstResponse, null, 2));

  console.log("\nSimulated request 2 (same warmed store):");
  const secondRequestClient = await createRequestClient(
    databaseClient,
    warmedStore,
  );
  const secondResponse = await secondRequestClient.sparql({
    query: createSubjectBoundPropertiesSparqlQuery(warmSubjectIri),
  });
  console.log(JSON.stringify(secondResponse, null, 2));
}
