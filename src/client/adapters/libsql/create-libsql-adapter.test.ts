import { assertEquals, assertExists } from "@std/assert";
import { createClient } from "@libsql/client";
import { QueryEngine } from "@comunica/query-sparql-rdfjs-lite";
import { createLibsqlAdapter } from "./create-libsql-adapter.ts";
import { Client } from "@/client/client.ts";
import { DataFactory } from "n3";

const queryEngine = new QueryEngine();
const { quad, namedNode, literal } = DataFactory;

Deno.test(
  "createLibsqlAdapter - queryEngine enables SPARQL on LibsqlRdfjsStore",
  async () => {
    const databaseClient = createClient({ url: ":memory:" });
    const adapter = await createLibsqlAdapter({
      client: databaseClient,
      queryEngine,
    });

    assertExists(adapter.sparqlEngine);

    const client = new Client(adapter);
    await client.import({
      source: {
        kind: "quads",
        quads: [
          quad(
            namedNode("urn:entity:hex"),
            namedNode("urn:label"),
            literal("hexastore client"),
          ),
        ],
      },
    });

    const sparqlResponse = await client.sparql({
      query: "SELECT ?o WHERE { <urn:entity:hex> <urn:label> ?o }",
    });

    assertEquals(sparqlResponse.kind, "select");

    databaseClient.close();
  },
);
