import { createClient as createLibsqlClient } from "@libsql/client";
import { Store } from "n3";
import { Client } from "@worlds/client";
import { provideLibsql } from "@worlds/client/providers/libsql";
import { hydrateStoreFromLibsql } from "@worlds/client/providers/libsql";
import { FakeEmbeddingService } from "@worlds/client/search-index/embedding-service";
import { generateSyntheticQuads } from "./synthetic-data.ts";

// Pre-allocated payloads for strict repeatable boundaries
const payloadSmall = generateSyntheticQuads(10);
const payloadMedium = generateSyntheticQuads(100);
const payloadLarge = generateSyntheticQuads(1000);

/**
 * setupIsolatedClient establishes an ephemeral database and initializes the core schema.
 * This prepares a clean testing boundary without contaminating timing measurements.
 */
async function setupIsolatedClient(): Promise<{
  client: Client;
  db: ReturnType<typeof createLibsqlClient>;
}> {
  const db = createLibsqlClient({ url: ":memory:" });
  const embeddingService = new FakeEmbeddingService();
  const clientOptions = await provideLibsql({ client: db, embeddingService });
  const client = new Client(clientOptions);
  return { client, db };
}

/**
 * createPreloadedDatabase persists a specified number of quads prior to timing trials.
 */
async function createPreloadedDatabase(count: number): Promise<{
  client: Client;
  db: ReturnType<typeof createLibsqlClient>;
}> {
  const { client, db } = await setupIsolatedClient();
  const testQuads = generateSyntheticQuads(count);
  await client.import({
    source: { kind: "quads", quads: testQuads },
  });
  return { client, db };
}

// -----------------------------------------------------------------------------
// BENCHMARK GROUP 1: Write Pressure (Transactions and Replication)
// Tests how import scalability handles growing quad counts per execution block.
// -----------------------------------------------------------------------------

Deno.bench({
  name: "Write Pressure: Import 10 Quads (:memory:)",
  group: "Write Pressure",
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
    const { db } = await createPreloadedDatabase(100);
    const targetStore = new Store();

    benchContext.start();
    await hydrateStoreFromLibsql(db, targetStore);
    benchContext.end();

    db.close();
  },
});

Deno.bench({
  name: "Hydration Scale: 1,000 Quads from DB",
  group: "Hydration Scale",
  async fn(benchContext) {
    const { db } = await createPreloadedDatabase(1000);
    const targetStore = new Store();

    benchContext.start();
    await hydrateStoreFromLibsql(db, targetStore);
    benchContext.end();

    db.close();
  },
});

Deno.bench({
  name: "Hydration Scale: 5,000 Quads from DB",
  group: "Hydration Scale",
  async fn(benchContext) {
    const { db } = await createPreloadedDatabase(5000);
    const targetStore = new Store();

    benchContext.start();
    await hydrateStoreFromLibsql(db, targetStore);
    benchContext.end();

    db.close();
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
    const { client, db } = await createPreloadedDatabase(2000);
    const targetKeyword = "SYNT-1500";

    benchContext.start();
    const response = await client.search({ query: targetKeyword });
    benchContext.end();

    if (!response.results || response.results.length === 0) {
      throw new Error("Search expected a result match for verification token.");
    }

    db.close();
  },
});

Deno.bench({
  name: "Search Queries: High Occurrence Word (Multi-Match)",
  group: "Search Speed",
  async fn(benchContext) {
    const { client, db } = await createPreloadedDatabase(2000);
    const commonKeyword = "synthetic";

    benchContext.start();
    await client.search({ query: commonKeyword });
    benchContext.end();

    db.close();
  },
});

Deno.bench({
  name: "Search Queries: Miss Target (Zero Matches)",
  group: "Search Speed",
  async fn(benchContext) {
    const { client, db } = await createPreloadedDatabase(2000);
    const nonExistentWord =
      "nonexistentwordthatcharacteristicallymisseseverything";

    benchContext.start();
    await client.search({ query: nonExistentWord });
    benchContext.end();

    db.close();
  },
});
