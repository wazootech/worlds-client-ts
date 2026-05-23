import { createClient } from "@libsql/client";
import type { Quad } from "@rdfjs/types";
import { QueryEngine } from "@comunica/query-sparql-rdfjs-lite";
import { Client } from "@worlds/client";
import { ComunicaSparqlEngine } from "@worlds/client/adapters/comunica";
import { createLibsqlClientOptions } from "@worlds/client/adapters/libsql";
import { createLibsqlN3ClientOptions } from "@worlds/client/adapters/libsql/n3";
import type { SparqlEngineInterface } from "@worlds/client/sparql-engine";
import { generateSyntheticQuads } from "./synthetic-data.ts";

/** selectiveSubjectIri is the grounded subject for subject-bound SPARQL benchmarks. */
export const selectiveSubjectIri = "urn:entity:0";

/** selectiveSparqlQuery exercises a subject-bound BGP (hexastore-friendly). */
export const selectiveSparqlQuery =
  `SELECT ?p ?o WHERE { <${selectiveSubjectIri}> ?p ?o }`;

/** fullScanSparqlQuery exercises an unbound triple pattern with a small result cap. */
export const fullScanSparqlQuery =
  "SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 100";

const sharedQueryEngine = new QueryEngine();

/** SparqlQueryShape labels the two SPARQL crossover query patterns. */
export type SparqlQueryShape = "selective" | "fullScan";

/** SparqlBackend labels hydrate+N3 vs hexastore LibsqlStore wiring. */
export type SparqlBackend = "hydrate+N3" | "libsqlStore";

/** standardCrossoverBackends compares hydrate+N3 and libsqlStore at smaller scales. */
export const standardCrossoverBackends = [
  "hydrate+N3",
  "libsqlStore",
] as const satisfies readonly SparqlBackend[];

/** largeCrossoverBackends is the production-scale libsqlStore path only (100k–1M). */
export const largeCrossoverBackends = [
  "libsqlStore",
] as const satisfies readonly SparqlBackend[];

/** PreloadedSparqlFixture holds a warmed SPARQL engine and its database handle. */
export interface PreloadedSparqlFixture {
  databaseClient: ReturnType<typeof createClient>;
  sparqlEngine: SparqlEngineInterface;
}

/**
 * sparqlEngineCacheKey builds a stable map key for preloaded crossover fixtures.
 */
export function sparqlEngineCacheKey(
  backend: SparqlBackend,
  quadCount: number,
): string {
  return `${backend}:${quadCount}`;
}

/**
 * sparqlQueryForShape returns the SPARQL string for a crossover query shape.
 */
export function sparqlQueryForShape(queryShape: SparqlQueryShape): string {
  return queryShape === "selective"
    ? selectiveSparqlQuery
    : fullScanSparqlQuery;
}

/**
 * createHydrateN3SparqlEngine wires Comunica over the hydrated proxied N3 store.
 */
async function createHydrateN3SparqlEngine(
  corpusQuads: Quad[],
): Promise<PreloadedSparqlFixture> {
  const databaseClient = createClient({ url: ":memory:" });
  const clientOptions = await createLibsqlN3ClientOptions({
    client: databaseClient,
    searchIndexOnImport: false,
    createSparqlEngine: ({ store }) =>
      new ComunicaSparqlEngine({ queryEngine: sharedQueryEngine, store }),
  });
  const worldsClient = new Client(clientOptions);
  await worldsClient.import({
    source: { kind: "quads", quads: corpusQuads },
  });
  if (!clientOptions.sparqlEngine) {
    throw new Error("hydrate+N3 bench requires createSparqlEngine");
  }
  return { databaseClient, sparqlEngine: clientOptions.sparqlEngine };
}

/**
 * createLibsqlHexastoreSparqlEngine wires Comunica over LibsqlStore (no N3 hydration).
 */
async function createLibsqlHexastoreSparqlEngine(
  corpusQuads: Quad[],
): Promise<PreloadedSparqlFixture> {
  const databaseClient = createClient({ url: ":memory:" });
  const clientOptions = await createLibsqlClientOptions({
    client: databaseClient,
    searchIndexOnImport: false,
    createSparqlEngine: ({ libsqlStore }) =>
      new ComunicaSparqlEngine({
        queryEngine: sharedQueryEngine,
        store: libsqlStore,
      }),
  });
  const worldsClient = new Client(clientOptions);
  await worldsClient.import({
    source: { kind: "quads", quads: corpusQuads },
  });
  if (!clientOptions.sparqlEngine) {
    throw new Error("libsqlStore bench requires createSparqlEngine");
  }
  return { databaseClient, sparqlEngine: clientOptions.sparqlEngine };
}

async function createSparqlEngineForBackend(
  backend: SparqlBackend,
  corpusQuads: Quad[],
): Promise<PreloadedSparqlFixture> {
  return backend === "hydrate+N3"
    ? await createHydrateN3SparqlEngine(corpusQuads)
    : await createLibsqlHexastoreSparqlEngine(corpusQuads);
}

/**
 * preloadSparqlCrossoverFixtures builds corpus+engine fixtures at module load.
 * Generates synthetic quads once per scale and reuses the array across backends.
 */
export async function preloadSparqlCrossoverFixtures(
  crossoverScales: readonly number[],
  logPrefix: string,
  crossoverBackends: readonly SparqlBackend[],
): Promise<Map<string, PreloadedSparqlFixture>> {
  const preloadedSparqlEngines = new Map<string, PreloadedSparqlFixture>();

  console.log(`Pre-populating SPARQL crossover engines (${logPrefix})...`);

  for (const quadCount of crossoverScales) {
    const corpusGenerationLabel = `${logPrefix} generate ${quadCount} quads`;
    console.time(corpusGenerationLabel);
    const corpusQuads = generateSyntheticQuads(quadCount);
    console.timeEnd(corpusGenerationLabel);

    for (const backend of crossoverBackends) {
      const preloadLabel = `${logPrefix} ${backend} ${quadCount}`;
      console.time(preloadLabel);
      const fixture = await createSparqlEngineForBackend(backend, corpusQuads);
      console.timeEnd(preloadLabel);
      preloadedSparqlEngines.set(
        sparqlEngineCacheKey(backend, quadCount),
        fixture,
      );
    }
  }

  console.log(`SPARQL crossover engines ready (${logPrefix}).`);
  return preloadedSparqlEngines;
}

/**
 * registerSparqlCrossoverUnloadCleanup closes database handles when the bench module unloads.
 */
export function registerSparqlCrossoverUnloadCleanup(
  preloadedSparqlEngines: Map<string, PreloadedSparqlFixture>,
): void {
  globalThis.addEventListener("unload", () => {
    for (const fixture of preloadedSparqlEngines.values()) {
      fixture.databaseClient.close();
    }
  });
}

/**
 * registerSparqlCrossoverBenchmarks registers execute-only crossover Deno.bench entries.
 */
export function registerSparqlCrossoverBenchmarks(
  crossoverScales: readonly number[],
  preloadedSparqlEngines: Map<string, PreloadedSparqlFixture>,
  crossoverBackends: readonly SparqlBackend[],
): void {
  for (const quadCount of crossoverScales) {
    for (const queryShape of ["selective", "fullScan"] as const) {
      for (const backend of crossoverBackends) {
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
}
