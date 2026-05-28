import { isBenchReuseDbEnabled } from "./shared/hexastore-perf-db-cache.ts";
import {
  libsqlHexastorePerfBackends,
  preloadSparqlHexastorePerfFixtures,
  registerSparqlHexastorePerfBenchmarks,
  registerSparqlHexastorePerfUnloadCleanup,
} from "./shared/sparql-hexastore-perf-shared.ts";

/** largePerfScales extend hexastore perf evidence to 100k-1M ([#76](https://github.com/wazootech/worlds-client-ts/issues/76)). */
const largePerfScales = [
  100_000,
  250_000,
  500_000,
  1_000_000,
] as const;

const preloadedSparqlEngines = await preloadSparqlHexastorePerfFixtures(
  largePerfScales,
  "large libsql",
  libsqlHexastorePerfBackends,
  { reuseFileCache: isBenchReuseDbEnabled() },
);

registerSparqlHexastorePerfUnloadCleanup(preloadedSparqlEngines);
registerSparqlHexastorePerfBenchmarks(
  largePerfScales,
  preloadedSparqlEngines,
  libsqlHexastorePerfBackends,
);
