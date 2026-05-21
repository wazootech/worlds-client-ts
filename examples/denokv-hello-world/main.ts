import { Client } from "@worlds/client";
import { ComunicaSparqlEngine } from "@worlds/client/providers/comunica";
import { provideDenoKv } from "@worlds/client/providers/denokv";
import { QueryEngine } from "@comunica/query-sparql-rdfjs-lite";

/**
 * This example demonstrates how to leverage the `provideDenokv` synthesis engine
 * for persistent, durable storage of RDF graph context, combined
 * with stateless serverless search and query execution.
 */
if (import.meta.main) {
  console.log("🚀 Initializing in-memory Deno Kv context...");
  const kv = await Deno.openKv(":memory:");
  const queryEngine = new QueryEngine();

  // 1. Synthesize stateless, just-in-time hydrating provider options
  console.log("🧠 Provisioning unified Deno Kv sync engine...");
  const providerOptions = provideDenoKv({
    kv,
    createSparqlEngine: ({ store }) =>
      new ComunicaSparqlEngine({ queryEngine, store }),
  });

  // 2. Construct the universal client gateway
  const client = new Client(providerOptions);
  console.log("💡 Stateless gateway operational!");

  // 3. Inject initial data if Deno Kv is empty
  const currentStore = await client.export({ format: { kind: "quads" } });
  const isEmpty = currentStore.kind === "quads" &&
    currentStore.quads.length === 0;

  if (isEmpty) {
    console.log(
      "\n📝 First execution detected! Ingesting primary Turtle context into Deno Kv...",
    );
    await client.import({
      source: {
        kind: "serialized",
        data: `
          <http://example.com/explorer/alice> <http://example.com/predicate/bio> "Alice is exploring the subterranean depths." .
          <http://example.com/explorer/alice> <http://example.com/predicate/location> "Underdark" .
        `,
        contentType: "text/turtle",
      },
    });
    console.log("✅ Initial dataset saved!");
  }

  // 4. Execute SPARQL query
  console.log(
    "\n⚙️ Executing declarative SPARQL SELECT across the loaded dataset...",
  );
  const sparqlResponse = await client.sparql({
    query: `
      SELECT ?s ?p ?o WHERE {
        ?s ?p ?o .
      }
    `,
  });

  if (sparqlResponse.kind === "select") {
    console.log("\n🏆 Quad Bindings Retrieved:");
    for (const row of sparqlResponse.data.results.bindings) {
      const values = Object.entries(row)
        .map(([key, value]) => `${key}: ${value.value}`)
        .join(", ");
      console.log(`   - [Binding] ${values}`);
    }
  }

  // 5. Perform textual search
  console.log("\n🔍 Executing keyword search for 'subterranean'...");
  const searchResponse = await client.search({ query: "subterranean" });
  console.log("\n🥇 Top Match Results:");
  console.log(JSON.stringify(searchResponse, null, 2));

  console.log("\n🏁 Closing Kv connection.");
  kv.close();
  console.log(
    "✨ Done! Demo concluded successfully! DenokvQuadStore loop closed cleanly.",
  );
}
