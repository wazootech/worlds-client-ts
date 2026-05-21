import { Client } from "@worlds/client";
import { createDenokvClientOptions } from "@worlds/client/adapters/denokv";
import { generateSyntheticQuads } from "./synthetic-data.ts";

// Pre-allocated payloads for strict repeatable boundaries
const payloadSmall = generateSyntheticQuads(10);
const payloadMedium = generateSyntheticQuads(100);
const payloadLarge = generateSyntheticQuads(1000);

/**
 * setupIsolatedClient establishes an ephemeral in-memory Deno.Kv and returns a client.
 */
async function setupIsolatedClient(): Promise<{
  client: Client;
  kv: Deno.Kv;
}> {
  const kv = await Deno.openKv(":memory:");
  const clientOptions = createDenokvClientOptions({ kv });
  const client = new Client(clientOptions);
  return { client, kv };
}

/**
 * createPreloadedDatabase persists a specified number of quads prior to timing trials.
 */
async function createPreloadedDatabase(count: number): Promise<{
  client: Client;
  kv: Deno.Kv;
}> {
  const { client, kv } = await setupIsolatedClient();
  const testQuads = generateSyntheticQuads(count);
  await client.import({
    source: { kind: "quads", quads: testQuads },
  });
  return { client, kv };
}

// -----------------------------------------------------------------------------
// BENCHMARK GROUP 1: Write Pressure (Deno Kv Batched Commits)
// Tests incremental batched ingestion limits for Deno Kv adapters.
// -----------------------------------------------------------------------------

Deno.bench({
  name: "Write Pressure: Import 10 Quads (Deno Kv :memory:)",
  group: "Write Pressure",
  async fn(benchContext) {
    const { client, kv } = await setupIsolatedClient();

    benchContext.start();
    await client.import({
      source: { kind: "quads", quads: payloadSmall },
    });
    benchContext.end();

    kv.close();
  },
});

Deno.bench({
  name: "Write Pressure: Import 100 Quads (Deno Kv :memory:)",
  group: "Write Pressure",
  async fn(benchContext) {
    const { client, kv } = await setupIsolatedClient();

    benchContext.start();
    await client.import({
      source: { kind: "quads", quads: payloadMedium },
    });
    benchContext.end();

    kv.close();
  },
});

Deno.bench({
  name: "Write Pressure: Import 1000 Quads (Deno Kv :memory:)",
  group: "Write Pressure",
  async fn(benchContext) {
    const { client, kv } = await setupIsolatedClient();

    benchContext.start();
    await client.import({
      source: { kind: "quads", quads: payloadLarge },
    });
    benchContext.end();

    kv.close();
  },
});

// -----------------------------------------------------------------------------
// BENCHMARK GROUP 2: Read Hydration Latency
// Measures the stateless edge cost of lazy workspace hydration.
// -----------------------------------------------------------------------------

Deno.bench({
  name: "Deno Kv Hydration: 100 Quads from DB",
  group: "Hydration Scale",
  async fn(benchContext) {
    const { client, kv } = await createPreloadedDatabase(100);

    benchContext.start();
    await client.export({ format: { kind: "quads" } });
    benchContext.end();

    kv.close();
  },
});

Deno.bench({
  name: "Deno Kv Hydration: 1,000 Quads from DB",
  group: "Hydration Scale",
  async fn(benchContext) {
    const { client, kv } = await createPreloadedDatabase(1000);

    benchContext.start();
    await client.export({ format: { kind: "quads" } });
    benchContext.end();

    kv.close();
  },
});

Deno.bench({
  name: "Deno Kv Hydration: 5,000 Quads from DB",
  group: "Hydration Scale",
  async fn(benchContext) {
    const { client, kv } = await createPreloadedDatabase(5000);

    benchContext.start();
    await client.export({ format: { kind: "quads" } });
    benchContext.end();

    kv.close();
  },
});

// -----------------------------------------------------------------------------
// BENCHMARK GROUP 3: DenokvSearchIndex full KV scan (not SPARQL hydration)
// client.search() calls DenokvSearchIndex.search(), which lists every quad under
// the KV prefix, deserializes each entry, and runs a naive includes() match.
// There is no N3 hydration and no early exit — hit and miss both scan the corpus.
// Preload is 2,000 quads; only the search call is timed.
// -----------------------------------------------------------------------------

Deno.bench({
  name: "Search: hit after full 2k KV scan (SYNT-1500)",
  group: "Search Speed",
  async fn(benchContext) {
    const { client, kv } = await createPreloadedDatabase(2000);
    const targetKeyword = "SYNT-1500";

    benchContext.start();
    const response = await client.search({ query: targetKeyword });
    benchContext.end();

    if (!response.results || response.results.length === 0) {
      throw new Error("Search expected a result match.");
    }

    kv.close();
  },
});

Deno.bench({
  name: "Search: miss after full 2k KV scan (no matches)",
  group: "Search Speed",
  async fn(benchContext) {
    const { client, kv } = await createPreloadedDatabase(2000);
    const nonExistentWord =
      "nonexistentwordthatcharacteristicallymisseseverything";

    benchContext.start();
    await client.search({ query: nonExistentWord });
    benchContext.end();

    kv.close();
  },
});
