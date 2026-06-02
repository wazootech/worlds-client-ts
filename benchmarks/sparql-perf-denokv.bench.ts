import {
  denokvHexastorePerfBackends,
  preloadSparqlHexastorePerfFixtures,
  registerSparqlHexastorePerfBenchmarks,
  registerSparqlHexastorePerfUnloadCleanup,
} from "./shared/sparql-perf-shared.ts";

/** standardPerfScales are corpus sizes for Deno KV quad index SPARQL execute benchmarks. */
const standardPerfScales = [1_000, 5_000, 10_000, 25_000, 50_000] as const;

const preloadedSparqlEngines = await preloadSparqlHexastorePerfFixtures(
  standardPerfScales,
  "standard denokv",
  denokvHexastorePerfBackends,
);

registerSparqlHexastorePerfUnloadCleanup(preloadedSparqlEngines);
registerSparqlHexastorePerfBenchmarks(
  standardPerfScales,
  preloadedSparqlEngines,
  denokvHexastorePerfBackends,
);
