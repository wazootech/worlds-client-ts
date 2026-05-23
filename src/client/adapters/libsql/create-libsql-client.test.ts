import { assertEquals, assertExists, assertRejects } from "@std/assert";
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

Deno.test(
  "createLibsqlClientOptions - searchIndexOnImport false skips chunks and search stays empty",
  async () => {
    const databaseClient = createClient({ url: ":memory:" });

    const client = new Client(
      await createLibsqlClientOptions({
        client: databaseClient,
        searchIndexOnImport: false,
        createSparqlEngine: ({ libsqlStore }) =>
          new ComunicaSparqlEngine({ queryEngine, store: libsqlStore }),
      }),
    );

    await client.import({
      source: {
        kind: "quads",
        quads: [
          quad(
            namedNode("urn:entity:sparql-only"),
            namedNode("urn:label"),
            literal("quads without search index"),
          ),
        ],
      },
    });

    const chunkRows = await databaseClient.execute(
      "SELECT COUNT(*) as total FROM chunks",
    );
    assertEquals(Number(chunkRows.rows[0].total), 0);

    const sparqlResponse = await client.sparql({
      query: "SELECT ?o WHERE { <urn:entity:sparql-only> <urn:label> ?o }",
    });
    assertEquals(sparqlResponse.kind, "select");
    if (sparqlResponse.kind === "select") {
      assertEquals(sparqlResponse.data.results.bindings.length, 1);
    }

    const searchResponse = await client.search({
      query: "quads without search",
    });
    assertEquals(searchResponse.results?.length ?? 0, 0);

    databaseClient.close();
  },
);

Deno.test(
  "createLibsqlClientOptions - rebuildSearchIndex after searchIndexOnImport false enables search",
  async () => {
    const databaseClient = createClient({ url: ":memory:" });

    const client = new Client(
      await createLibsqlClientOptions({
        client: databaseClient,
        searchIndexOnImport: false,
        createSparqlEngine: ({ libsqlStore }) =>
          new ComunicaSparqlEngine({ queryEngine, store: libsqlStore }),
      }),
    );

    await client.import({
      source: {
        kind: "quads",
        quads: [
          quad(
            namedNode("urn:entity:rebuild-me"),
            namedNode("urn:label"),
            literal("rebuild search index later"),
          ),
        ],
      },
    });

    const beforeRebuild = await databaseClient.execute(
      "SELECT COUNT(*) as total FROM chunks",
    );
    assertEquals(Number(beforeRebuild.rows[0].total), 0);

    const rebuildResponse = await client.rebuildSearchIndex();
    assertEquals(rebuildResponse.processedQuadCount, 1);
    assertEquals(rebuildResponse.chunkRowCount > 0, true);

    const afterRebuild = await databaseClient.execute(
      "SELECT COUNT(*) as total FROM chunks",
    );
    assertEquals(Number(afterRebuild.rows[0].total) > 0, true);

    const searchResponse = await client.search({
      query: "rebuild search",
    });
    assertEquals(searchResponse.results?.length ?? 0, 1);

    databaseClient.close();
  },
);

Deno.test(
  "createLibsqlClientOptions - rebuildSearchIndex quadFilter scopes indexed graphs",
  async () => {
    const databaseClient = createClient({ url: ":memory:" });
    const graphAlpha = namedNode("urn:graph:alpha");
    const graphBeta = namedNode("urn:graph:beta");

    const client = new Client(
      await createLibsqlClientOptions({
        client: databaseClient,
        searchIndexOnImport: false,
        createSparqlEngine: ({ libsqlStore }) =>
          new ComunicaSparqlEngine({ queryEngine, store: libsqlStore }),
      }),
    );

    await client.import({
      source: {
        kind: "quads",
        quads: [
          quad(
            namedNode("urn:entity:alpha"),
            namedNode("urn:label"),
            literal("alpha graph only"),
            graphAlpha,
          ),
          quad(
            namedNode("urn:entity:beta"),
            namedNode("urn:label"),
            literal("beta graph only"),
            graphBeta,
          ),
        ],
      },
    });

    await client.rebuildSearchIndex({
      quadFilter: { include: { graphs: ["urn:graph:alpha"] } },
    });

    const alphaSearch = await client.search({ query: "alpha graph" });
    assertEquals(alphaSearch.results?.length ?? 0, 1);

    const betaSearch = await client.search({ query: "beta graph" });
    assertEquals(betaSearch.results?.length ?? 0, 0);

    databaseClient.close();
  },
);

Deno.test(
  "createLibsqlClientOptions - rebuildSearchIndex is idempotent on second run",
  async () => {
    const databaseClient = createClient({ url: ":memory:" });

    const client = new Client(
      await createLibsqlClientOptions({
        client: databaseClient,
        searchIndexOnImport: false,
        createSparqlEngine: ({ libsqlStore }) =>
          new ComunicaSparqlEngine({ queryEngine, store: libsqlStore }),
      }),
    );

    await client.import({
      source: {
        kind: "quads",
        quads: [
          quad(
            namedNode("urn:entity:idempotent"),
            namedNode("urn:label"),
            literal("idempotent rebuild"),
          ),
        ],
      },
    });

    const firstRebuild = await client.rebuildSearchIndex();
    const secondRebuild = await client.rebuildSearchIndex();

    assertEquals(firstRebuild.chunkRowCount, secondRebuild.chunkRowCount);

    const chunkRows = await databaseClient.execute(
      "SELECT COUNT(*) as total FROM chunks",
    );
    assertEquals(
      Number(chunkRows.rows[0].total),
      secondRebuild.chunkRowCount,
    );

    databaseClient.close();
  },
);

Deno.test(
  "createLibsqlClientOptions - searchIndexOnImport false rejects deferSearchIndexOnImport",
  async () => {
    const databaseClient = createClient({ url: ":memory:" });

    await assertRejects(
      () =>
        createLibsqlClientOptions({
          client: databaseClient,
          searchIndexOnImport: false,
          deferSearchIndexOnImport: true,
        }),
      Error,
      "searchIndexOnImport: false cannot be combined with deferSearchIndexOnImport: true",
    );

    databaseClient.close();
  },
);
