import { assertEquals, assertRejects } from "@std/assert";
import { DataFactory, Store } from "n3";
import { Client } from "./client.ts";
import { RdfjsQuadStore, RdfjsSearchIndex } from "./adapters/rdfjs/mod.ts";
import { ComunicaSparqlEngine } from "./adapters/comunica/mod.ts";
import { QueryEngine } from "@comunica/query-sparql-rdfjs-lite";
import { hashQuad } from "./quad-store/mod.ts";

const queryEngine = new QueryEngine();

function createTestClient(store: Store): Client {
  return new Client(
    new RdfjsQuadStore(store),
    new RdfjsSearchIndex(store),
    new ComunicaSparqlEngine({ queryEngine, store }),
  );
}

Deno.test("Client.import delegates to quadStore.import", async () => {
  const store = new Store();
  const client = createTestClient(store);

  await client.import({
    mode: "merge",
    source: {
      kind: "serialized",
      data:
        `<http://example.com/client> <http://example.com/action> "test_import" .`,
      contentType: "text/turtle",
    },
  });

  assertEquals(
    store.size,
    1,
    "Client should have successfully invoked quadStore import",
  );
});

Deno.test("Client.export delegates to quadStore.export", async () => {
  const store = new Store();
  const client = createTestClient(store);

  const response = await client.export({ format: { kind: "quads" } });

  if (response.kind !== "quads") throw new Error("Should be quads");
  assertEquals(response.quads.length, 0);
});

Deno.test("Client.sparql delegates to sparqlEngine.sparql", async () => {
  const store = new Store();
  const client = createTestClient(store);

  const response = await client.sparql({
    query: "ASK WHERE { ?s ?p ?o }",
  });

  if (response.kind !== "ask") throw new Error("Should be ask");
  assertEquals(response.data.boolean, false);
});

Deno.test("Client.sparql rejects when sparqlEngine is not configured", async () => {
  const store = new Store();
  const client = new Client(
    new RdfjsQuadStore(store),
    new RdfjsSearchIndex(store),
  );

  await assertRejects(
    () => client.sparql({ query: "ASK WHERE { ?s ?p ?o }" }),
    Error,
    "SPARQL engine is not configured.",
  );
});

Deno.test("Client.search delegates to searchIndex.search", async () => {
  const store = new Store();
  store.addQuad(
    DataFactory.namedNode("http://example.com/sub"),
    DataFactory.namedNode("http://example.com/pred"),
    DataFactory.literal("Integrate all systems."),
  );

  const client = createTestClient(store);

  const response = await client.search({ query: "integrate" });
  assertEquals(response.results?.length, 1);
  assertEquals(response.results?.[0].text, "Integrate all systems.");
});

Deno.test("Client.search returns stable hashQuad-based search result ids", async () => {
  const store = new Store();
  const indexedQuad = DataFactory.quad(
    DataFactory.namedNode("http://example.com/sub"),
    DataFactory.namedNode("http://example.com/pred"),
    DataFactory.literal("Integrate all systems."),
  );
  store.addQuad(indexedQuad);

  const client = createTestClient(store);

  const firstResponse = await client.search({ query: "integrate" });
  const secondResponse = await client.search({ query: "integrate" });
  const expectedId = await hashQuad(indexedQuad);

  assertEquals(firstResponse.results?.[0].id, expectedId);
  assertEquals(secondResponse.results?.[0].id, expectedId);
});
