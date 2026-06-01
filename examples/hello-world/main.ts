import { Client } from "@worlds/client";
import { ComunicaSparqlEngine } from "@worlds/client/adapters/comunica";
import {
  RdfjsQuadStore,
  RdfjsSearchIndex,
} from "@worlds/client/adapters/rdfjs";
import { QueryEngine } from "@comunica/query-sparql-rdfjs-lite";
import { Store } from "n3";
import type { QuadTransaction } from "@worlds/client/rdfjs-buffer";
import type * as rdfjs from "@rdfjs/types";

if (import.meta.main) {
  const store = new Store();
  const queryEngine = new QueryEngine();
  const client = new Client({
    quadStore: new RdfjsQuadStore(store),
    searchIndex: new RdfjsSearchIndex(store),
    sparqlEngine: new ComunicaSparqlEngine({
      queryEngine,
      readSource: store,
      transactionFactory: () => {
        return {
          addQuad: (q: rdfjs.Quad) => store.addQuad(q),
          removeQuad: (q: rdfjs.Quad) => store.removeQuad(q),
          commit: () => Promise.resolve(),
          rollback: () => {},
        } as unknown as QuadTransaction;
      },
    }),
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
