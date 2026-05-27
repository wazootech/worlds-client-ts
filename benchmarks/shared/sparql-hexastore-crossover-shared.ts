import { createClient } from "@libsql/client";
import type { Quad } from "@rdfjs/types";
import { QueryEngine } from "@comunica/query-sparql-rdfjs-lite";
import type { Client } from "@worlds/client";
import { createComunicaLibsqlSparqlEngineFactory } from "@worlds/client/adapters/comunica";
import { createLibsqlClient } from "@worlds/client/adapters/libsql";
import { createLibsqlN3ComunicaClient } from "@worlds/client/adapters/libsql-n3/comunica";
import {
  buildCrossoverFixtureChecksumInputs,
  computeCrossoverFixtureChecksum,
  ensureCrossoverCacheDirectoryExists,
  removeStaleCrossoverCacheFiles,
  resolveCrossoverDbCacheDirectory,
  resolveCrossoverDbCachePaths,
  tryResolveCrossoverCacheHit,
  writeCrossoverFixtureManifest,
} from "./crossover-db-cache.ts";
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

/** PreloadedSparqlFixture holds a warmed Client and its database handle. */
export interface PreloadedSparqlFixture {
  databaseClient: ReturnType<typeof createClient>;
  worldsClient: Client;
}

/**
 * PreloadSparqlCrossoverOptions configures crossover module preload behavior.
 */
export interface PreloadSparqlCrossoverOptions {
  /** reuseFileCache enables on-disk libsqlStore fixtures when BENCH_REUSE_DB=1. */
  reuseFileCache?: boolean;
}

/**
 * LibsqlHexastoreFixtureResult reports whether a libsqlStore fixture used the file cache.
 */
interface LibsqlHexastoreFixtureResult {
  /** fixture is the warmed SPARQL engine and database handle. */
  fixture: PreloadedSparqlFixture;
  /** cacheHit is true when an on-disk database was reused without re-import. */
  cacheHit: boolean;
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
 * importCorpusIntoLibsqlHexastore persists quads into LibSQL without timing SPARQL execute.
 */
async function importCorpusIntoLibsqlHexastore(
  databaseClient: ReturnType<typeof createClient>,
  corpusQuads: Quad[],
): Promise<void> {
  const worldsClient = await createLibsqlClient({
    client: databaseClient,
    searchIndexOnImport: "disabled",
  });
  await worldsClient.import({
    source: { kind: "quads", quads: corpusQuads },
  });
}

/**
 * openLibsqlHexastoreSparqlEngine wires Comunica over an existing LibsqlStore database.
 */
async function openLibsqlHexastoreSparqlEngine(
  databaseClient: ReturnType<typeof createClient>,
): Promise<PreloadedSparqlFixture> {
  const worldsClient = await createLibsqlClient({
    client: databaseClient,
    searchIndexOnImport: "disabled",
    createSparqlEngine: createComunicaLibsqlSparqlEngineFactory({
      queryEngine: sharedQueryEngine,
    }),
  });
  return { databaseClient, worldsClient };
}

/**
 * createLibsqlHexastoreSparqlEngine wires Comunica over LibsqlStore (no N3 hydration).
 */
async function createLibsqlHexastoreSparqlEngine(
  corpusQuads: Quad[],
  options?: { reuseFileCache?: boolean },
): Promise<LibsqlHexastoreFixtureResult> {
  if (!options?.reuseFileCache) {
    const databaseClient = createClient({ url: ":memory:" });
    await importCorpusIntoLibsqlHexastore(databaseClient, corpusQuads);
    const fixture = await openLibsqlHexastoreSparqlEngine(databaseClient);
    return { fixture, cacheHit: false };
  }

  const quadCount = corpusQuads.length;
  const cachePaths = resolveCrossoverDbCachePaths(quadCount, "libsqlStore");
  const checksumInputs = buildCrossoverFixtureChecksumInputs(quadCount);
  const expectedChecksum = await computeCrossoverFixtureChecksum(
    checksumInputs,
  );

  const cacheHit = await tryResolveCrossoverCacheHit(
    cachePaths,
    expectedChecksum,
    quadCount,
  );

  if (cacheHit) {
    const databaseClient = createClient({ url: cachePaths.databaseFileUrl });
    const fixture = await openLibsqlHexastoreSparqlEngine(databaseClient);
    return { fixture, cacheHit: true };
  }

  await ensureCrossoverCacheDirectoryExists(resolveCrossoverDbCacheDirectory());
  await removeStaleCrossoverCacheFiles(cachePaths);

  const databaseClient = createClient({ url: cachePaths.databaseFileUrl });
  await importCorpusIntoLibsqlHexastore(databaseClient, corpusQuads);

  const manifest = {
    ...checksumInputs,
    checksum: expectedChecksum,
  };
  await writeCrossoverFixtureManifest(cachePaths.manifestPath, manifest);

  const fixture = await openLibsqlHexastoreSparqlEngine(databaseClient);
  return { fixture, cacheHit: false };
}

/**
 * createHydrateN3SparqlEngine wires Comunica over the hydrated proxied N3 store.
 */
async function createHydrateN3SparqlEngine(
  corpusQuads: Quad[],
): Promise<PreloadedSparqlFixture> {
  const databaseClient = createClient({ url: ":memory:" });
  const worldsClient = await createLibsqlN3ComunicaClient({
    client: databaseClient,
    searchIndexOnImport: "disabled",
    queryEngine: sharedQueryEngine,
  });
  await worldsClient.import({
    source: { kind: "quads", quads: corpusQuads },
  });
  return { databaseClient, worldsClient };
}

async function createSparqlEngineForBackend(
  backend: SparqlBackend,
  corpusQuads: Quad[],
  preloadOptions?: PreloadSparqlCrossoverOptions,
): Promise<{ fixture: PreloadedSparqlFixture; cacheHit: boolean }> {
  if (backend === "hydrate+N3") {
    const fixture = await createHydrateN3SparqlEngine(corpusQuads);
    return { fixture, cacheHit: false };
  }
  const { fixture, cacheHit } = await createLibsqlHexastoreSparqlEngine(
    corpusQuads,
    { reuseFileCache: preloadOptions?.reuseFileCache },
  );
  return { fixture, cacheHit };
}

/**
 * preloadSparqlCrossoverFixtures builds corpus+engine fixtures at module load.
 * Generates synthetic quads once per scale and reuses the array across backends.
 */
export async function preloadSparqlCrossoverFixtures(
  crossoverScales: readonly number[],
  logPrefix: string,
  crossoverBackends: readonly SparqlBackend[],
  preloadOptions?: PreloadSparqlCrossoverOptions,
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
      const { fixture, cacheHit } = await createSparqlEngineForBackend(
        backend,
        corpusQuads,
        preloadOptions,
      );
      console.timeEnd(preloadLabel);
      if (cacheHit) {
        console.log(`${preloadLabel} (cache hit)`);
      } else if (
        preloadOptions?.reuseFileCache && backend === "libsqlStore"
      ) {
        console.log(`${preloadLabel} (imported to file cache)`);
      }
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
            await fixture.worldsClient.sparql({ query });
            benchContext.end();
          },
        });
      }
    }
  }
}
