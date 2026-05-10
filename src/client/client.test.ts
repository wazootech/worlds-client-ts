import { assertEquals } from "@std/assert";
import { Store } from "n3";
import { Client } from "./client.ts";

Deno.test("Client.import delegates to executeImport and populates store", async () => {
  const store = new Store();

  // Provide mock store via options
  const client = new Client({
    getRdfjsStore: () => Promise.resolve(store),
  });

  // Perform import via the client
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
    "Client should have successfully invoked importer on its store",
  );
});

Deno.test("Client.export delegates to executeExport", async () => {
  const store = new Store();

  const client = new Client({
    getRdfjsStore: () => Promise.resolve(store),
  });

  // Expect empty array back since store is empty
  const response = await client.export({ format: { kind: "quads" } });

  if (response.kind !== "quads") throw new Error("Should be quads");
  assertEquals(response.quads.length, 0);
});

Deno.test("Client.sparql delegates to executeSparql", async () => {
  const store = new Store();

  const client = new Client({
    getRdfjsStore: () => Promise.resolve(store),
  });

  const response = await client.sparql({
    query: "ASK WHERE { ?s ?p ?o }",
  });

  if (response.kind !== "ask") throw new Error("Should be ask");
  assertEquals(response.data.boolean, false);
});

Deno.test("Client.search delegates to executeSearch", async () => {
  const store = new Store();

  const client = new Client({
    getRdfjsStore: () => Promise.resolve(store),
  });

  const response = await client.search({ query: "findme" });
  assertEquals(response.results?.length, 0);
});
