import {
  preloadSparqlCrossoverFixtures,
  registerSparqlCrossoverBenchmarks,
  registerSparqlCrossoverUnloadCleanup,
  standardCrossoverBackends,
} from "./shared/sparql-hexastore-crossover-shared.ts";

/** crossoverScales are corpus sizes used to locate the hydrate vs hexastore crossover. */
const crossoverScales = [1_000, 5_000, 10_000, 25_000, 50_000] as const;

const preloadedSparqlEngines = await preloadSparqlCrossoverFixtures(
  crossoverScales,
  "standard",
  standardCrossoverBackends,
);

registerSparqlCrossoverUnloadCleanup(preloadedSparqlEngines);
registerSparqlCrossoverBenchmarks(
  crossoverScales,
  preloadedSparqlEngines,
  standardCrossoverBackends,
);
