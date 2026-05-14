import { assertEquals, assertExists } from "@std/assert";
import { createClient as createLibsqlClient } from "@libsql/client";
import { DataFactory } from "n3";
import { Client } from "#/client/client.ts";
import { provideLibsql } from "./provide-libsql.ts";
import { FakeEmbeddingService } from "#/client/search-index/embedding-service/mod.ts";

const { quad, namedNode, literal } = DataFactory;

Deno.test("E2E DEMO: unified data entry enables immediate hybrid search availability", async (t) => {
  // 1. Initialize ephemeral environment
  const db = createLibsqlClient({ url: ":memory:" });
  const embeddingService = new FakeEmbeddingService();

  const client = new Client(
    await provideLibsql({ client: db, embeddingService }),
  );

  await t.step(
    "Scenario 1: client.import delivers immediate index observability",
    async () => {
      // Define a fact using standard import format
      const testQuad = quad(
        namedNode("urn:person:alice"),
        namedNode("urn:bio"),
        literal("Alice is an adventurer visiting mountain peaks."),
      );

      // Perform the import.
      // Expected side effects: Memory updated -> Proxy triggered -> Synchronizer queued -> Flush commits to LibSQL chunks and quads.
      await client.import({
        source: { kind: "quads", quads: [testQuad] },
      });

      // Immediately attempt querying for newly imported data
      const res = await client.search({ query: "adventurer" });

      // ASSERT: Data IS present immediately after function call concludes.
      assertExists(res.results);
      assertEquals(
        res.results.length,
        1,
        "Search failed to discover newly imported text.",
      );
      assertEquals(res.results[0].subject, "urn:person:alice");
    },
  );

  await t.step(
    "Scenario 2: client.sparql UPDATE automatically synchronizes implicitly",
    async () => {
      // Craft a raw SPARQL INSERT query mimicking client-driven scripting
      const query = `
      INSERT DATA {
        <urn:person:bob> <urn:bio> "Bob prefers the deep dense forests for his camp." .
      }
    `;

      // Perform operation.
      // Expected: Comunica touches Proxied Store -> Hook triggers Synchronizer -> Flushed implicitly!
      await client.sparql({ query });

      // Search for unique keyword from the SPARQL payload
      const res = await client.search({ query: "forests" });

      // ASSERT: Implicit SPARQL update triggered index materialization successfully.
      assertExists(res.results);
      assertEquals(
        res.results.length > 0,
        true,
        "SPARQL update was lost by the indexers!",
      );

      // Verify correctly prioritized matches
      const match = res.results.find((r) => r.subject === "urn:person:bob");
      assertExists(
        match,
        "Implicit observer failed to ingest Comunica memory stream.",
      );
      assertEquals(
        match?.text,
        "Bob prefers the deep dense forests for his camp.",
      );
    },
  );

  await t.step(
    "Scenario 3: Complete circular flow includes hydration integrity",
    async () => {
      // Destroy active memory references and simulate a software crash/reboot.
      // Create a fresh client reusing the SAME physical :memory: database.
      const refreshedClient = new Client(
        await provideLibsql({ client: db, embeddingService }),
      );

      // Perform a search directly on the new client.
      // Expected: Hydrator recovered facts from 'quads' table -> re-rendered memory -> enabled lookups!
      const res = await refreshedClient.search({ query: "mountain" });

      assertExists(res.results);
      assertEquals(
        res.results.length > 0,
        true,
        "Fresh client failed to hydrate history from stable storage.",
      );

      const match = res.results.find((r) => r.subject === "urn:person:alice");
      assertExists(match, "Bootstrap hydration skipped master record data.");
    },
  );

  await t.step(
    "Scenario 4: replace mode removes stale quads and search rows",
    async () => {
      const firstQuad = quad(
        namedNode("urn:person:carol"),
        namedNode("urn:bio"),
        literal("Carol is a unique_z444_test_tag mountain explorer."),
      );
      const secondQuad = quad(
        namedNode("urn:person:dave"),
        namedNode("urn:bio"),
        literal("Dave is a unique_z888_test_tag sea navigator."),
      );

      await client.import({
        source: { kind: "quads", quads: [firstQuad, secondQuad] },
      });

      const beforeCarol = await client.search({
        query: "unique_z444_test_tag",
      });
      const beforeDave = await client.search({
        query: "unique_z888_test_tag",
      });

      assertEquals(
        beforeCarol.results?.some((result) =>
          result.subject === "urn:person:carol"
        ),
        true,
      );
      assertEquals(
        beforeDave.results?.some((result) =>
          result.subject === "urn:person:dave"
        ),
        true,
      );

      await client.import({
        mode: "replace",
        source: { kind: "quads", quads: [firstQuad] },
      });

      const afterCarol = await client.search({
        query: "unique_z444_test_tag",
      });
      const afterDave = await client.search({
        query: "unique_z888_test_tag",
      });

      assertEquals(
        afterCarol.results?.some((result) =>
          result.subject === "urn:person:carol"
        ),
        true,
      );
      assertEquals(
        afterDave.results?.some((result) =>
          result.subject === "urn:person:dave"
        ),
        false,
      );

      const quadsTable = await db.execute(
        "SELECT COUNT(*) AS count FROM quads",
      );
      const chunksTable = await db.execute(
        "SELECT COUNT(*) AS count FROM chunks",
      );
      assertEquals(Number(quadsTable.rows[0]?.count), 1);
      assertEquals(Number(chunksTable.rows[0]?.count), 1);
    },
  );
});

Deno.test("QuadFilter Integration: enables hybrid partitioning persisting specific graphs while keeping others ephemeral", async () => {
  const db = createLibsqlClient({ url: ":memory:" });
  const embeddingService = new FakeEmbeddingService();

  const PERSISTENT_GRAPH = "http://worlds.wazoo.dev/.well-known/durable";
  const EPHEMERAL_GRAPH = "http://worlds.wazoo.dev/.well-known/ephemeral";

  // Initialize client with filter restricting SQL writes exclusively to the persistent graph
  const client = new Client(
    await provideLibsql({
      client: db,
      embeddingService,
      quadFilter: {
        include: {
          graphs: [PERSISTENT_GRAPH],
        },
      },
    }),
  );

  // 1. Stage both durable and ephemeral facts
  const durableQuad = quad(
    namedNode("urn:topic:durable"),
    namedNode("urn:prop"),
    literal("This fact belongs to durable storage and must persist."),
    namedNode(PERSISTENT_GRAPH),
  );

  const ephemeralQuad = quad(
    namedNode("urn:topic:ephemeral"),
    namedNode("urn:prop"),
    literal("This fact is highly ephemeral and should stay in memory."),
    namedNode(EPHEMERAL_GRAPH),
  );

  await client.import({
    source: { kind: "quads", quads: [durableQuad, ephemeralQuad] },
  });

  // 2. ASSERT: Both live inside active Memory right now
  const activeSearchDurable = await client.search({ query: "durable" });
  const activeSearchEphemeral = await client.search({ query: "ephemeral" });

  assertEquals(
    activeSearchDurable.results?.length,
    1,
    "Durable quad lost in memory context",
  );
  assertEquals(
    activeSearchEphemeral.results?.length,
    1,
    "Ephemeral quad lost in memory context",
  );

  // 3. ASSERT: Verify physical database tables. Only ONE row should exist!
  const resultSet = await db.execute("SELECT id, g FROM quads");
  assertEquals(
    resultSet.rows.length,
    1,
    "Database received an ephemeral write that violated synchronization filters!",
  );
  assertEquals(
    String(resultSet.rows[0].g),
    PERSISTENT_GRAPH,
    "Database saved the incorrect graph!",
  );

  // 4. ASSERT: Verify Hydration boundary on reboot
  // Restart client pointing to the same DB with identical filtering bounds
  const restartedClient = new Client(
    await provideLibsql({
      client: db,
      embeddingService,
      quadFilter: {
        include: {
          graphs: [PERSISTENT_GRAPH],
        },
      },
    }),
  );

  const rebootSearchDurable = await restartedClient.search({
    query: "durable",
  });
  const rebootSearchEphemeral = await restartedClient.search({
    query: "ephemeral",
  });

  // Durable survives the cycle!
  assertEquals(
    rebootSearchDurable.results?.length,
    1,
    "Durable quad failed to survive application reboot bootstrap cycle",
  );

  // Ephemeral is properly lost forever (cleaned out of memory, never saved to disk)
  const ephemeralMatch = rebootSearchEphemeral.results?.find(
    (r) => r.subject === "urn:topic:ephemeral",
  );
  assertEquals(
    ephemeralMatch,
    undefined,
    "Ephemeral quad leaked into reboot state!",
  );
});
