import { Client } from "@worlds/client";
import { ComunicaSparqlEngine } from "@worlds/client/adapters/comunica";
import {
  RdfjsQuadStore,
  RdfjsSearchIndex,
} from "@worlds/client/adapters/rdfjs";
import { QueryEngine } from "@comunica/query-sparql-rdfjs-lite";
import { Store } from "n3";

if (import.meta.main) {
  const store = new Store();
  const queryEngine = new QueryEngine();
  const client = new Client({
    quadStore: new RdfjsQuadStore({ store }),
    searchIndex: new RdfjsSearchIndex(store),
    sparqlEngine: new ComunicaSparqlEngine({ queryEngine, store: store }),
  });

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
