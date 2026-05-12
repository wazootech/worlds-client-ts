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
});
