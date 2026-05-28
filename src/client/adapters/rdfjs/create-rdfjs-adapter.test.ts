import { assertEquals, assertRejects } from "@std/assert";
import { QueryEngine } from "@comunica/query-sparql-rdfjs-lite";
import { DataFactory, Store } from "n3";
import { Client } from "@/client/client.ts";
import { createRdfjsAdapter } from "./create-rdfjs-adapter.ts";

const { quad, namedNode, literal } = DataFactory;
const queryEngine = new QueryEngine();

Deno.test(
  "createRdfjsAdapter - import delivers immediate search hits",
  async () => {
    const client = new Client(createRdfjsAdapter());
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
  "createRdfjsAdapter - preloaded store is shared with the client",
  async () => {
    const store = new Store();
    store.addQuad(
      namedNode("http://example.com/existing"),
      namedNode("http://example.com/pred"),
      literal("Preloaded fact."),
    );

    const client = new Client(createRdfjsAdapter({ store }));

    const response = await client.search({ query: "preloaded" });
    assertEquals(response.results?.length, 1);
    assertEquals(store.size, 1);
  },
);

Deno.test(
  "createRdfjsAdapter - queryEngine enables SELECT queries",
  async () => {
    const client = new Client(
      createRdfjsAdapter({
        queryEngine,
      }),
    );

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
  "createRdfjsAdapter - rebuildSearchIndex rejects on non-LibSQL topology",
  async () => {
    const client = new Client(createRdfjsAdapter());

    await assertRejects(
      () => client.rebuildSearchIndex(),
      Error,
      "search index rebuild is only supported for LibSQL-backed clients",
    );
  },
);

Deno.test(
  "createRdfjsAdapter - sparql rejects when queryEngine is omitted",
  async () => {
    const client = new Client(createRdfjsAdapter());

    await assertRejects(
      () => client.sparql({ query: "ASK WHERE { ?s ?p ?o }" }),
      Error,
      "SPARQL engine is not configured.",
    );
  },
);
