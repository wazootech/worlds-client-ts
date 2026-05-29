import { assertEquals, assertRejects } from "@std/assert";
import { QueryEngine } from "@comunica/query-sparql-rdfjs-lite";
import { DataFactory, Store } from "n3";
import { createRdfjsClient } from "./create-rdfjs-client.ts";

const { quad, namedNode, literal } = DataFactory;
const queryEngine = new QueryEngine();

Deno.test(
  "createRdfjsClient - import delivers immediate search hits",
  async () => {
    const client = createRdfjsClient();
    const testQuad = quad(
      namedNode("http://example.com/sub"),
      namedNode("http://example.com/pred"),
      literal("Factory wiring works."),
    );

    await client.import({ source: { kind: "quads", quads: [testQuad] } });

    const response = await client.search({ query: "wiring" });
    assertEquals(response.results?.length, 1);
    assertEquals(response.results?.[0].text, "Factory wiring works.");
  },
);

Deno.test(
  "createRdfjsClient - preloaded store is shared with the client",
  async () => {
    const store = new Store();
    store.addQuad(
      namedNode("http://example.com/existing"),
      namedNode("http://example.com/pred"),
      literal("Preloaded fact."),
    );

    const client = createRdfjsClient({ store });

    const response = await client.search({ query: "preloaded" });
    assertEquals(response.results?.length, 1);
    assertEquals(store.size, 1);
  },
);

Deno.test(
  "createRdfjsClient - queryEngine enables SELECT queries",
  async () => {
    const client = createRdfjsClient({
      queryEngine,
    });

    await client.import({
      source: {
        kind: "quads",
        quads: [
          quad(
            namedNode("http://example.com/s"),
            namedNode("http://example.com/p"),
            literal("hello"),
          ),
        ],
      },
    });

    const response = await client.sparql({
      query:
        "SELECT ?text WHERE { <http://example.com/s> <http://example.com/p> ?text }",
    });

    if (response.kind !== "select") {
      throw new Error("Expected select response kind");
    }
    assertEquals(response.data.results.bindings.length, 1);
    assertEquals(response.data.results.bindings[0].text?.value, "hello");
  },
);

Deno.test(
  "createRdfjsClient - reindex is a successful no-op",
  async () => {
    const client = createRdfjsClient();

    const response = await client.reindex();
    assertEquals(response.processedQuadCount, 0);
    assertEquals(response.chunkRowCount, 0);
  },
);

Deno.test(
  "createRdfjsClient - sparql rejects when queryEngine is omitted",
  async () => {
    const client = createRdfjsClient();

    await assertRejects(
      () => client.sparql({ query: "ASK WHERE { ?s ?p ?o }" }),
      Error,
      "SPARQL engine is not configured.",
    );
  },
);
