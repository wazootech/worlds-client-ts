import { assertEquals } from "@std/assert";
import { createClient } from "@libsql/client";
import { QueryEngine } from "@comunica/query-sparql-rdfjs-lite";
import { DataFactory } from "n3";

import type { Adapter } from "@/client/client.ts";
import { Client } from "@/client/client.ts";
import type { LibsqlAdapterOptions } from "@/client/adapters/libsql/create-libsql-adapter.ts";
import { createLibsqlAdapter } from "@/client/adapters/libsql/create-libsql-adapter.ts";

const { quad, namedNode, literal } = DataFactory;
const queryEngine = new QueryEngine();

const expectedHexastoreIndexNames = [
  "idx_quads_spog",
  "idx_quads_sopg",
  "idx_quads_pso",
  "idx_quads_pos",
  "idx_quads_ospg",
  "idx_quads_opsg",
  "idx_quads_gpso",
] as const;

interface LibsqlAdapterFixture {
  label: string;
  createAdapter: (options: LibsqlAdapterOptions) => Promise<Adapter>;
}

const libsqlAdapterFixtures: LibsqlAdapterFixture[] = [
  { label: "hexastore", createAdapter: createLibsqlAdapter },
];

for (const fixture of libsqlAdapterFixtures) {
  Deno.test(
    `${fixture.label} - initializeSchema provisions all hexastore indexes`,
    async () => {
      const databaseClient = createClient({ url: ":memory:" });

      await fixture.createAdapter({ client: databaseClient });

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

      await fixture.createAdapter({ client: databaseClient });

      databaseClient.close();
    },
  );

  Deno.test(
    `${fixture.label} - import persists quads readable via SPARQL`,
    async () => {
      const databaseClient = createClient({ url: ":memory:" });

      const client = new Client(
        await fixture.createAdapter({
          client: databaseClient,
          queryEngine,
        }),
      );

      await client.import({
        source: {
          kind: "quads",
          quads: [
            quad(
              namedNode(`urn:entity:${fixture.label}`),
              namedNode("urn:label"),
              literal(`${fixture.label} adapter`),
            ),
          ],
        },
      });

      const sparqlResponse = await client.sparql({
        query:
          `SELECT ?object WHERE { <urn:entity:${fixture.label}> <urn:label> ?object }`,
      });

      assertEquals(sparqlResponse.kind, "select");
      if (sparqlResponse.kind === "select") {
        assertEquals(sparqlResponse.data.results.bindings.length, 1);
      }

      databaseClient.close();
    },
  );

  Deno.test(
    `${fixture.label} - searchIndexOnImport disabled skips chunks`,
    async () => {
      const databaseClient = createClient({ url: ":memory:" });

      const client = new Client(
        await fixture.createAdapter({
          client: databaseClient,
          searchIndexOnImport: "disabled",
          queryEngine,
        }),
      );

      await client.import({
        source: {
          kind: "quads",
          quads: [
            quad(
              namedNode(`urn:entity:sparql-only:${fixture.label}`),
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

      const searchResponse = await client.search({
        query: "quads without search",
      });
      assertEquals(searchResponse.results?.length ?? 0, 0);

      databaseClient.close();
    },
  );

  Deno.test(
    `${fixture.label} - rebuildSearchIndex enables search after disabled import`,
    async () => {
      const databaseClient = createClient({ url: ":memory:" });

      const client = new Client(
        await fixture.createAdapter({
          client: databaseClient,
          searchIndexOnImport: "disabled",
          queryEngine,
        }),
      );

      await client.import({
        source: {
          kind: "quads",
          quads: [
            quad(
              namedNode(`urn:entity:rebuild:${fixture.label}`),
              namedNode("urn:label"),
              literal("rebuild search index later"),
            ),
          ],
        },
      });

      const rebuildResponse = await client.rebuildSearchIndex();
      assertEquals(rebuildResponse.processedQuadCount, 1);
      assertEquals(rebuildResponse.chunkRowCount > 0, true);

      const searchResponse = await client.search({ query: "rebuild search" });
      assertEquals(searchResponse.results?.length ?? 0, 1);

      databaseClient.close();
    },
  );
}
