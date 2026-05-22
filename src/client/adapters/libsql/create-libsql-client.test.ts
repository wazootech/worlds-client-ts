import { assertEquals, assertExists } from "@std/assert";
import { createClient } from "@libsql/client";
import { QueryEngine } from "@comunica/query-sparql-rdfjs-lite";
import { DataFactory } from "n3";
import { Client } from "@/client/client.ts";
import { ComunicaSparqlEngine } from "@/client/adapters/comunica/mod.ts";
import { createLibsqlClientOptions } from "./create-libsql-client.ts";
import type { LibsqlStore } from "./libsql-store.ts";

const { quad, namedNode, literal } = DataFactory;
const queryEngine = new QueryEngine();

/** expectedHexastoreIndexNames lists the seven covering indexes provisioned at schema init. */
const expectedHexastoreIndexNames = [
  "idx_quads_spog",
  "idx_quads_sopg",
  "idx_quads_pso",
  "idx_quads_pos",
  "idx_quads_ospg",
  "idx_quads_opsg",
  "idx_quads_gpso",
] as const;

Deno.test(
  "createLibsqlClientOptions - createSparqlEngine receives LibsqlStore",
  async () => {
    const databaseClient = createClient({ url: ":memory:" });
    let receivedLibsqlStore: LibsqlStore | undefined;

    await createLibsqlClientOptions({
      client: databaseClient,
      createSparqlEngine: ({ libsqlStore }) => {
        receivedLibsqlStore = libsqlStore;
        return new ComunicaSparqlEngine({ queryEngine, store: libsqlStore });
      },
    });

    assertExists(receivedLibsqlStore);

    databaseClient.close();
  },
);

Deno.test(
  "createLibsqlClientOptions - import persists quads readable via SPARQL",
  async () => {
    const databaseClient = createClient({ url: ":memory:" });

    const client = new Client(
      await createLibsqlClientOptions({
        client: databaseClient,
        createSparqlEngine: ({ libsqlStore }) =>
          new ComunicaSparqlEngine({ queryEngine, store: libsqlStore }),
      }),
    );

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
    if (sparqlResponse.kind === "select") {
      assertEquals(sparqlResponse.data.results.bindings.length, 1);
    }

    databaseClient.close();
  },
);

Deno.test(
  "createLibsqlClientOptions - initializeSchema provisions all hexastore indexes",
  async () => {
    const databaseClient = createClient({ url: ":memory:" });

    await createLibsqlClientOptions({ client: databaseClient });

    const indexResultSet = await databaseClient.execute(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'quads'",
    );
    const indexNames = indexResultSet.rows.map((row) => String(row.name));
    for (const expectedName of expectedHexastoreIndexNames) {
      assertEquals(
        indexNames.includes(expectedName),
        true,
        `missing hexastore index: ${expectedName}`,
      );
    }

    await createLibsqlClientOptions({ client: databaseClient });

    databaseClient.close();
  },
);
