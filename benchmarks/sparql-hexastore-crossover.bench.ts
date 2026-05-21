import { createClient } from "@libsql/client";
import { QueryEngine } from "@comunica/query-sparql-rdfjs-lite";
import { Client } from "@worlds/client";
import { ComunicaSparqlEngine } from "@worlds/client/adapters/comunica";
import { createLibsqlClientOptions } from "@worlds/client/adapters/libsql";
import { createLibsqlN3ClientOptions } from "@worlds/client/adapters/libsql/n3";
import type { SparqlEngineInterface } from "@worlds/client/sparql-engine";
import { generateSyntheticQuads } from "./synthetic-data.ts";

/** crossoverScales are corpus sizes used to locate the hydrate vs hexastore crossover. */
const crossoverScales = [1_000, 5_000, 10_000, 25_000, 50_000] as const;

/** selectiveSubjectIri is the grounded subject for subject-bound SPARQL benchmarks. */
const selectiveSubjectIri = "urn:entity:0";

/** selectiveSparqlQuery exercises a subject-bound BGP (hexastore-friendly). */
const selectiveSparqlQuery =
  `SELECT ?p ?o WHERE { <${selectiveSubjectIri}> ?p ?o }`;

/** fullScanSparqlQuery exercises an unbound triple pattern with a small result cap. */
const fullScanSparqlQuery = "SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 100";

const sharedQueryEngine = new QueryEngine();

/**
 * createHydrateN3SparqlEngine wires Comunica over the hydrated proxied N3 store (today's default).
 */
async function createHydrateN3SparqlEngine(
  quadCount: number,
): Promise<{
  databaseClient: ReturnType<typeof createClient>;
  sparqlEngine: SparqlEngineInterface;
}> {
  const databaseClient = createClient({ url: ":memory:" });
  const clientOptions = await createLibsqlN3ClientOptions({
    client: databaseClient,
    createSparqlEngine: ({ store }) =>
      new ComunicaSparqlEngine({ queryEngine: sharedQueryEngine, store }),
  });
  const worldsClient = new Client(clientOptions);
  await worldsClient.import({
    source: { kind: "quads", quads: generateSyntheticQuads(quadCount) },
  });
  if (!clientOptions.sparqlEngine) {
    throw new Error("hydrate+N3 bench requires createSparqlEngine");
  }
  return { databaseClient, sparqlEngine: clientOptions.sparqlEngine };
}

/**
 * createLibsqlHexastoreSparqlEngine wires Comunica over the hexastore client (no N3 hydration).
 */
async function createLibsqlHexastoreSparqlEngine(
  quadCount: number,
): Promise<{
  databaseClient: ReturnType<typeof createClient>;
  sparqlEngine: SparqlEngineInterface;
}> {
  const databaseClient = createClient({ url: ":memory:" });
  const clientOptions = await createLibsqlClientOptions({
    client: databaseClient,
    createSparqlEngine: ({ libsqlStore }) =>
      new ComunicaSparqlEngine({
        queryEngine: sharedQueryEngine,
        store: libsqlStore,
      }),
  });
  const worldsClient = new Client(clientOptions);
  await worldsClient.import({
    source: { kind: "quads", quads: generateSyntheticQuads(quadCount) },
  });
  if (!clientOptions.sparqlEngine) {
    throw new Error("libsqlStore bench requires createSparqlEngine");
  }
  return { databaseClient, sparqlEngine: clientOptions.sparqlEngine };
}

type SparqlQueryShape = "selective" | "fullScan";
type SparqlBackend = "hydrate+N3" | "libsqlStore";

/** PreloadedSparqlFixture holds a warmed SPARQL engine and its database handle. */
interface PreloadedSparqlFixture {
  databaseClient: ReturnType<typeof createClient>;
  sparqlEngine: SparqlEngineInterface;
}

function sparqlEngineCacheKey(
  backend: SparqlBackend,
  quadCount: number,
): string {
  return `${backend}:${quadCount}`;
}

function sparqlQueryForShape(queryShape: SparqlQueryShape): string {
  return queryShape === "selective"
    ? selectiveSparqlQuery
    : fullScanSparqlQuery;
}

async function createSparqlEngineForBackend(
  backend: SparqlBackend,
  quadCount: number,
): Promise<PreloadedSparqlFixture> {
  return backend === "hydrate+N3"
    ? await createHydrateN3SparqlEngine(quadCount)
    : await createLibsqlHexastoreSparqlEngine(quadCount);
}

console.log("Pre-populating SPARQL crossover engines...");

const preloadedSparqlEngines = new Map<string, PreloadedSparqlFixture>();

for (const quadCount of crossoverScales) {
  for (const backend of ["hydrate+N3", "libsqlStore"] as const) {
    const fixture = await createSparqlEngineForBackend(backend, quadCount);
    preloadedSparqlEngines.set(
      sparqlEngineCacheKey(backend, quadCount),
      fixture,
    );
  }
}

console.log("SPARQL crossover engines ready.");

globalThis.addEventListener("unload", () => {
  for (const fixture of preloadedSparqlEngines.values()) {
    fixture.databaseClient.close();
  }
});

for (const quadCount of crossoverScales) {
  for (const queryShape of ["selective", "fullScan"] as const) {
    for (const backend of ["hydrate+N3", "libsqlStore"] as const) {
      const query = sparqlQueryForShape(queryShape);
      const cacheKey = sparqlEngineCacheKey(backend, quadCount);
      Deno.bench({
        name:
          `SPARQL Crossover: ${quadCount} quads | ${queryShape} | ${backend}`,
        group: `SPARQL Crossover (${quadCount})`,
        async fn(benchContext) {
          const fixture = preloadedSparqlEngines.get(cacheKey);
          if (!fixture) {
            throw new Error(`Missing preloaded SPARQL fixture: ${cacheKey}`);
          }

          benchContext.start();
          await fixture.sparqlEngine.execute({ query });
          benchContext.end();
        },
      });
    }
  }
}
