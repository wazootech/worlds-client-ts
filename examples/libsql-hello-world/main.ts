import { createClient } from "@libsql/client";
import { ComunicaSparqlEngine } from "@worlds/client/adapters/comunica";
import { createLibsqlClient } from "@worlds/client/adapters/libsql";
import { QueryEngine } from "@comunica/query-sparql-rdfjs-lite";

/**
 * This example demonstrates how to use `createLibsqlClient` to instantly wire up a complete
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
  const queryEngine = new QueryEngine();

  console.log("🧠 Provisioning unified LibSQL sync engine...");
  const client = await createLibsqlClient({
    client: db,
    createSparqlEngine: ({ store }) =>
      new ComunicaSparqlEngine({ queryEngine, store }),
  });
  console.log("💡 Gateway operational!");

  // 3. Standard data entry ingestion
  console.log("\n📝 Ingesting primary textual Turtle context...");
  await client.import({
    source: {
      kind: "serialized",
      data:
        `<http://example.com/subject> <http://example.com/predicate> "Hello, World!" .`,
      contentType: "text/turtle",
    },
    mode: "merge",
  });

  console.log("\n🔍 Executing hybrid search...");
  const response = await client.search({ query: "Hello" });
  console.log(JSON.stringify(response, null, 2));

  console.log("\n🧠 Executing SPARQL query...");
  const sparqlResponse = await client.sparql({
    query: "SELECT ?s ?p ?o WHERE { ?s ?p ?o }",
  });
  console.log(JSON.stringify(sparqlResponse, null, 2));
}
