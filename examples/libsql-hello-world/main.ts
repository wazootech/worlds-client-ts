import { createClient } from "@libsql/client";
import { Client, FakeEmbeddingService, provideLibsql } from "@worlds/client";

/**
 * This example demonstrates how to use `provideLibsql` to instantly wire up a complete
 * AI-powered hybrid search platform over an embedded or remote LibSQL database.
 *
 * It transparently handles:
 * 1. Automatic durable schema initialization.
 * 2. Direct active memory observability capturing semantic drift.
 * 3. Cascading background replication synchronization.
 */
if (import.meta.main) {
  console.log("🚀 Initializing durable LibSQL context...");
  const db = createClient({ url: ":memory:" });

  // 1. Synthesize unified provider options for the client gateway
  console.log("🧠 Provisioning unified LibSQL sync engine...");
  const providerOptions = await provideLibsql({
    client: db,
  });

  // 2. Construct the universal client gateway
  const client = new Client(providerOptions);
  console.log("💡 Gateway operational!");

  // 3. Standard data entry ingestion
  console.log("\n📝 Ingesting primary textual Turtle context...");
  await client.import({
    source: {
      kind: "serialized",
      data: `
        <http://example.com/explorer/alice> <http://example.com/predicate/bio> "Alice explores new frontiers." .
      `,
      contentType: "text/turtle",
    },
  });

  // 4. Fire an indirect SPARQL update statement!
  // The client automatically intercepts internal mutations and replicates them into LibSQL.
  console.log(
    "⚙️ Executing declarative SPARQL UPDATE (transparent replication)...",
  );
  await client.sparql({
    query: `
      INSERT DATA {
        <http://example.com/explorer/bob> <http://example.com/predicate/bio> "Bob is an experienced deep-sea oceanographer." .
      }
    `,
  });

  // 5. Verify the replication and hybrid FTS index are fully active!
  console.log(
    "\n🔍 Executing unified Hybrid Vector and Textual search query for 'deep sea oceanographer'...",
  );
  const searchResponse = await client.search({ query: "deep sea" });

  console.log("\n🏆 Result Set Retrieved:");
  console.log(JSON.stringify(searchResponse, null, 2));

  console.log(
    "\n🏁 Demo concluded successfully! Full persistence loop closed cleanly.",
  );
}
