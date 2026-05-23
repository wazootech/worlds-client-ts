import { isBenchReuseDbEnabled } from "./shared/crossover-db-cache.ts";
import {
  largeCrossoverBackends,
  preloadSparqlCrossoverFixtures,
  registerSparqlCrossoverBenchmarks,
  registerSparqlCrossoverUnloadCleanup,
} from "./shared/sparql-hexastore-crossover-shared.ts";

/** largeCrossoverScales extend crossover evidence to 100k–1M ([#76](https://github.com/wazootech/worlds-client-ts/issues/76)). */
const largeCrossoverScales = [
  100_000,
  250_000,
  500_000,
  1_000_000,
] as const;

const preloadedSparqlEngines = await preloadSparqlCrossoverFixtures(
  largeCrossoverScales,
  "large",
  largeCrossoverBackends,
  { reuseFileCache: isBenchReuseDbEnabled() },
);

registerSparqlCrossoverUnloadCleanup(preloadedSparqlEngines);
registerSparqlCrossoverBenchmarks(
  largeCrossoverScales,
  preloadedSparqlEngines,
  largeCrossoverBackends,
);
