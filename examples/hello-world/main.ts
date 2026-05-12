import {
  Client,
  ComunicaSparqlEngine,
  RdfjsQuadStore,
  RdfjsSearchIndex,
} from "@worlds/client";
import { QueryEngine } from "@comunica/query-sparql-rdfjs-lite";
import { Store } from "n3";

if (import.meta.main) {
  const queryEngine = new QueryEngine();
  const store = new Store();
  const client = new Client({
    quadStore: new RdfjsQuadStore(store),
    searchIndex: new RdfjsSearchIndex(store),
    sparqlEngine: new ComunicaSparqlEngine(queryEngine, store),
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
