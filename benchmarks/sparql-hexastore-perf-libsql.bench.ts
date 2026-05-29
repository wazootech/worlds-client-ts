import {
  libsqlHexastorePerfBackends,
  preloadSparqlHexastorePerfFixtures,
  registerSparqlHexastorePerfBenchmarks,
  registerSparqlHexastorePerfUnloadCleanup,
} from "./shared/sparql-hexastore-perf-shared.ts";

/** standardPerfScales are corpus sizes for LibSQL hexastore SPARQL execute benchmarks. */
const standardPerfScales = [1_000, 5_000, 10_000, 25_000, 50_000] as const;

const preloadedSparqlEngines = await preloadSparqlHexastorePerfFixtures(
  standardPerfScales,
  "standard libsql",
  libsqlHexastorePerfBackends,
);

registerSparqlHexastorePerfUnloadCleanup(preloadedSparqlEngines);
registerSparqlHexastorePerfBenchmarks(
  standardPerfScales,
  preloadedSparqlEngines,
  libsqlHexastorePerfBackends,
);
