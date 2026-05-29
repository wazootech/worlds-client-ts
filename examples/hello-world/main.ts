import { Client } from "@worlds/client";
import { createRdfjsAdapter } from "@worlds/client/adapters/rdfjs";
import { QueryEngine } from "@comunica/query-sparql-rdfjs-lite";

if (import.meta.main) {
  const queryEngine = new QueryEngine();
  const client = new Client(
    createRdfjsAdapter({
      queryEngine,
    }),
  );

  await client.import({
    source: {
      kind: "serialized",
      data:
        `<http://example.com/subject> <http://example.com/predicate> "Hello, World!" .`,
      contentType: "text/turtle",
    },
    mode: "merge",
  });

  const response = await client.search({ query: "Hello" });
  console.log(JSON.stringify(response, null, 2));
}
