import { assertEquals, assertExists } from "@std/assert";
import { createClient } from "@libsql/client";
import { DataFactory } from "n3";
import { commitPatchToLibsql } from "@/client/adapters/libsql/sync/commit-patch-to-libsql.ts";
import {
  setupLibsqlSchemaForTest,
  sharedTextSplitter,
  testLibsqlQueryBuilder,
} from "@/client/adapters/libsql/libsql-test-fixtures.ts";
import { LibsqlSearchIndex } from "./libsql-search-index.ts";
import { rebuildLibsqlSearchIndexFromQuads } from "./rebuild-libsql-search-index-from-quads.ts";
import { resolveLabelPredicates } from "./search-chunk-fts.ts";

const { quad, namedNode, literal } = DataFactory;

const AURELIA = "http://example.org/Aurelia";
const HAS_CAPITAL = "http://example.org/hasCapital";
const RDFS_LABEL = "http://www.w3.org/2000/01/rdf-schema#label";
const CUSTOM_LABEL = "http://example.org/customLabel";

Deno.test(
  "rebuildLibsqlSearchIndexFromQuads - discovers subject via fts_value while value stays literal",
  async () => {
    const client = createClient({ url: ":memory:" });
    await setupLibsqlSchemaForTest(client);

    const capitalQuad = quad(
      namedNode(AURELIA),
      namedNode(HAS_CAPITAL),
      literal("Lume"),
    );

    await commitPatchToLibsql({
      insertions: [capitalQuad],
      deletions: [],
    }, {
      client,
      textSplitter: sharedTextSplitter,
      libsqlQueryBuilder: testLibsqlQueryBuilder,
    });

    const chunkRows = await client.execute(
      "SELECT value, fts_value FROM chunks",
    );
    assertEquals(chunkRows.rows[0].value, "Lume");
    assertEquals(
      String(chunkRows.rows[0].fts_value).includes("Aurelia"),
      true,
    );

    const searchIndex = new LibsqlSearchIndex({
      client,
      libsqlQueryBuilder: testLibsqlQueryBuilder,
    });

    const discovery = await searchIndex.search({ query: "Aurelia" });
    assertEquals(discovery.results?.length, 1);
    assertEquals(discovery.results?.[0].subject, AURELIA);
    assertEquals(discovery.results?.[0].text, "Lume");
  },
);

Deno.test(
  "rebuildLibsqlSearchIndexFromQuads - label literals enable discovery by alias",
  async () => {
    const client = createClient({ url: ":memory:" });
    await setupLibsqlSchemaForTest(client);

    const capitalQuad = quad(
      namedNode(AURELIA),
      namedNode(HAS_CAPITAL),
      literal("Lume"),
    );
    const labelQuad = quad(
      namedNode(AURELIA),
      namedNode(RDFS_LABEL),
      literal("Kingdom of Aurelia"),
    );

    await commitPatchToLibsql({
      insertions: [capitalQuad, labelQuad],
      deletions: [],
    }, {
      client,
      textSplitter: sharedTextSplitter,
      libsqlQueryBuilder: testLibsqlQueryBuilder,
    });

    const searchIndex = new LibsqlSearchIndex({
      client,
      libsqlQueryBuilder: testLibsqlQueryBuilder,
    });

    const discovery = await searchIndex.search({ query: "Kingdom" });
    assertEquals(
      discovery.results?.some((result) => result.subject === AURELIA),
      true,
    );
    assertEquals(
      discovery.results?.some((result) => result.predicate === HAS_CAPITAL),
      true,
    );
  },
);

Deno.test(
  "rebuildLibsqlSearchIndexFromQuads - rebuild refreshes fts_value after schema-style reindex",
  async () => {
    const client = createClient({ url: ":memory:" });
    await setupLibsqlSchemaForTest(client);

    const capitalQuad = quad(
      namedNode(AURELIA),
      namedNode(HAS_CAPITAL),
      literal("Lume"),
    );

    await commitPatchToLibsql({
      insertions: [capitalQuad],
      deletions: [],
    }, {
      client,
      textSplitter: sharedTextSplitter,
      libsqlQueryBuilder: testLibsqlQueryBuilder,
    });

    await client.execute({
      sql: "UPDATE chunks SET fts_value = ? WHERE predicate = ?",
      args: ["Lume", HAS_CAPITAL],
    });
    await client.execute(
      testLibsqlQueryBuilder.buildRebuildChunksFtsIndex(),
    );

    const rebuildResult = await rebuildLibsqlSearchIndexFromQuads({
      client,
      textSplitter: sharedTextSplitter,
      libsqlQueryBuilder: testLibsqlQueryBuilder,
    });

    assertEquals(rebuildResult.processedQuadCount, 1);
    assertEquals(rebuildResult.chunkRowCount, 1);

    const chunkRows = await client.execute(
      "SELECT value, fts_value FROM chunks",
    );
    assertEquals(chunkRows.rows[0].value, "Lume");
    assertEquals(
      String(chunkRows.rows[0].fts_value).includes("Aurelia"),
      true,
    );

    const searchIndex = new LibsqlSearchIndex({
      client,
      libsqlQueryBuilder: testLibsqlQueryBuilder,
    });
    const discovery = await searchIndex.search({ query: "Aurelia" });
    assertExists(discovery.results?.[0]);
    assertEquals(discovery.results?.[0].subject, AURELIA);
  },
);

Deno.test(
  "rebuildLibsqlSearchIndexFromQuads - extended labelPredicates union is indexed",
  async () => {
    const client = createClient({ url: ":memory:" });
    await setupLibsqlSchemaForTest(client);

    const entity = "http://example.org/Entity";
    const factQuad = quad(
      namedNode(entity),
      namedNode("http://example.org/description"),
      literal("A remote outpost"),
    );
    const customLabelQuad = quad(
      namedNode(entity),
      namedNode(CUSTOM_LABEL),
      literal("Outpost Alpha"),
    );

    await commitPatchToLibsql({
      insertions: [factQuad, customLabelQuad],
      deletions: [],
    }, {
      client,
      textSplitter: sharedTextSplitter,
      libsqlQueryBuilder: testLibsqlQueryBuilder,
      labelPredicates: [CUSTOM_LABEL],
    });

    const predicates = resolveLabelPredicates([CUSTOM_LABEL]);
    assertEquals(predicates.includes(CUSTOM_LABEL), true);
    assertEquals(predicates.includes(RDFS_LABEL), true);

    const searchIndex = new LibsqlSearchIndex({
      client,
      libsqlQueryBuilder: testLibsqlQueryBuilder,
    });

    const discovery = await searchIndex.search({ query: "Outpost" });
    assertEquals(
      discovery.results?.some((result) => result.subject === entity),
      true,
    );
    assertEquals(
      discovery.results?.some((result) =>
        result.predicate === "http://example.org/description"
      ),
      true,
    );
  },
);

Deno.test(
  "rebuildLibsqlSearchIndexFromQuads - label update fan-out refreshes sibling fact chunks",
  async () => {
    const client = createClient({ url: ":memory:" });
    await setupLibsqlSchemaForTest(client);

    const capitalQuad = quad(
      namedNode(AURELIA),
      namedNode(HAS_CAPITAL),
      literal("Lume"),
    );

    await commitPatchToLibsql({
      insertions: [capitalQuad],
      deletions: [],
    }, {
      client,
      textSplitter: sharedTextSplitter,
      libsqlQueryBuilder: testLibsqlQueryBuilder,
    });

    await commitPatchToLibsql({
      insertions: [
        quad(
          namedNode(AURELIA),
          namedNode(RDFS_LABEL),
          literal("New Kingdom Name"),
        ),
      ],
      deletions: [],
    }, {
      client,
      textSplitter: sharedTextSplitter,
      libsqlQueryBuilder: testLibsqlQueryBuilder,
    });

    const capitalChunk = await client.execute({
      sql: "SELECT fts_value FROM chunks WHERE predicate = ?",
      args: [HAS_CAPITAL],
    });
    assertEquals(
      String(capitalChunk.rows[0].fts_value).includes("New Kingdom Name"),
      true,
    );

    const searchIndex = new LibsqlSearchIndex({
      client,
      libsqlQueryBuilder: testLibsqlQueryBuilder,
    });
    const discovery = await searchIndex.search({ query: "New Kingdom" });
    const capitalHit = discovery.results?.find((result) =>
      result.predicate === HAS_CAPITAL
    );
    assertEquals(capitalHit?.subject, AURELIA);
    assertEquals(capitalHit?.text, "Lume");
  },
);
