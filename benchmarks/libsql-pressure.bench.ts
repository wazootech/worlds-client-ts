import { createClient } from "@libsql/client";
import { Store } from "n3";
import type { Client } from "@worlds/client";
import { createLibsqlN3Client } from "@worlds/client/adapters/libsql-n3";
import { hydrateStoreFromLibsql } from "@worlds/client/adapters/libsql-n3";
import { FakeEmbeddingService } from "@worlds/client/search-index/embedding-service";
import { generateSyntheticQuads } from "./shared/synthetic-data.ts";

// Pre-allocated payloads for strict repeatable boundaries
const payloadSmall = generateSyntheticQuads(10);
const payloadMedium = generateSyntheticQuads(100);
const payloadLarge = generateSyntheticQuads(1000);

/** writeBenchIterations stabilizes write-pressure timings across GC between cold DB setups. */
const writeBenchWarmup = 5;
const writeBenchIterations = 50;

/**
 * setupIsolatedClient establishes an ephemeral database and initializes the core schema.
 * This prepares a clean testing boundary without contaminating timing measurements.
 */
async function setupIsolatedClient(): Promise<{
  client: Client;
  db: ReturnType<typeof createClient>;
}> {
  const db = createClient({ url: ":memory:" });
  const embeddingService = new FakeEmbeddingService();
  const client = await createLibsqlN3Client({
    client: db,
    embeddingService,
  });
  return { client, db };
}

/**
 * preloadDatabaseOnly imports quads into LibSQL and returns the database handle for hydration benches.
 */
async function preloadDatabaseOnly(
  count: number,
): Promise<ReturnType<typeof createClient>> {
  const { client, db } = await setupIsolatedClient();
  await client.import({
    source: { kind: "quads", quads: generateSyntheticQuads(count) },
  });
  return db;
}

/**
 * createPreloadedClient persists a specified number of quads and returns a ready search client.
 */
async function createPreloadedClient(count: number): Promise<{
  client: Client;
  db: ReturnType<typeof createClient>;
}> {
  const { client, db } = await setupIsolatedClient();
  await client.import({
    source: { kind: "quads", quads: generateSyntheticQuads(count) },
  });
  return { client, db };
}

console.log("Pre-populating libsql benchmark datasets...");

const hydrationDatabase100 = await preloadDatabaseOnly(100);
const hydrationDatabase1000 = await preloadDatabaseOnly(1000);
const hydrationDatabase5000 = await preloadDatabaseOnly(5000);
const searchCorpus = await createPreloadedClient(2000);

console.log("Libsql benchmark datasets ready.");

globalThis.addEventListener("unload", () => {
  hydrationDatabase100.close();
  hydrationDatabase1000.close();
  hydrationDatabase5000.close();
  searchCorpus.db.close();
});

// -----------------------------------------------------------------------------
// BENCHMARK GROUP 1: Write Pressure (Transactions and Replication)
// Tests how import scalability handles growing quad counts per execution block.
// -----------------------------------------------------------------------------

Deno.bench({
  name: "Write Pressure: Import 10 Quads (:memory:)",
  group: "Write Pressure",
  warmup: writeBenchWarmup,
  n: writeBenchIterations,
  async fn(benchContext) {
    const { client, db } = await setupIsolatedClient();

    benchContext.start();
    await client.import({
      source: { kind: "quads", quads: payloadSmall },
    });
    benchContext.end();

    db.close();
  },
});

Deno.bench({
  name: "Write Pressure: Import 100 Quads (:memory:)",
  group: "Write Pressure",
  warmup: writeBenchWarmup,
  n: writeBenchIterations,
  async fn(benchContext) {
    const { client, db } = await setupIsolatedClient();

    benchContext.start();
    await client.import({
      source: { kind: "quads", quads: payloadMedium },
    });
    benchContext.end();

    db.close();
  },
});

Deno.bench({
  name: "Write Pressure: Import 1000 Quads (:memory:)",
  group: "Write Pressure",
  warmup: writeBenchWarmup,
  n: writeBenchIterations,
  async fn(benchContext) {
    const { client, db } = await setupIsolatedClient();

    benchContext.start();
    await client.import({
      source: { kind: "quads", quads: payloadLarge },
    });
    benchContext.end();

    db.close();
  },
});

// -----------------------------------------------------------------------------
// BENCHMARK GROUP 2: Read Hydration Latency
// Measures the speed of restoring full graph context back to an in-memory N3 Store.
// -----------------------------------------------------------------------------

Deno.bench({
  name: "Hydration Scale: 100 Quads from DB",
  group: "Hydration Scale",
  async fn(benchContext) {
    const targetStore = new Store();

    benchContext.start();
    await hydrateStoreFromLibsql(hydrationDatabase100, targetStore);
    benchContext.end();
  },
});

Deno.bench({
  name: "Hydration Scale: 1,000 Quads from DB",
  group: "Hydration Scale",
  async fn(benchContext) {
    const targetStore = new Store();

    benchContext.start();
    await hydrateStoreFromLibsql(hydrationDatabase1000, targetStore);
    benchContext.end();
  },
});

Deno.bench({
  name: "Hydration Scale: 5,000 Quads from DB",
  group: "Hydration Scale",
  async fn(benchContext) {
    const targetStore = new Store();

    benchContext.start();
    await hydrateStoreFromLibsql(hydrationDatabase5000, targetStore);
    benchContext.end();
  },
});

// -----------------------------------------------------------------------------
// BENCHMARK GROUP 3: Full-Text Search Performance
// Tests the index lookup speeds against moderate real-world dataset sizes.
// -----------------------------------------------------------------------------

Deno.bench({
  name: "Search Queries: Specific Unique Keyword (Single Match)",
  group: "Search Speed",
  async fn(benchContext) {
    const targetKeyword = "SYNT-1500";

    benchContext.start();
    const response = await searchCorpus.client.search({
      query: targetKeyword,
    });
    benchContext.end();

    if (!response.results || response.results.length === 0) {
      throw new Error("Search expected a result match for verification token.");
    }
  },
});

Deno.bench({
  name: "Search Queries: High Occurrence Word (Multi-Match)",
  group: "Search Speed",
  async fn(benchContext) {
    const commonKeyword = "synthetic";

    benchContext.start();
    await searchCorpus.client.search({ query: commonKeyword });
    benchContext.end();
  },
});

Deno.bench({
  name: "Search Queries: Miss Target (Zero Matches)",
  group: "Search Speed",
  async fn(benchContext) {
    const nonExistentWord =
      "nonexistentwordthatcharacteristicallymisseseverything";

    benchContext.start();
    await searchCorpus.client.search({ query: nonExistentWord });
    benchContext.end();
  },
});
