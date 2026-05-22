import { assertEquals } from "@std/assert";
import { createClient } from "@libsql/client";
import { DataFactory } from "n3";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { commitPatchToLibsql } from "./commit-patch-to-libsql.ts";
import { FakeEmbeddingService } from "../../search-index/embedding-service/mod.ts";
import { LibsqlQueryBuilder } from "./libsql-query-builder.ts";

const { quad, namedNode, literal } = DataFactory;

const testLibsqlQueryBuilder = new LibsqlQueryBuilder(32);

async function setupSchema(client: ReturnType<typeof createClient>) {
  await client.execute(testLibsqlQueryBuilder.buildLibsqlQuadsTable()); // <--- Demand Quads Table exist
  await client.execute(testLibsqlQueryBuilder.buildLibsqlChunksTable());
  await client.execute(testLibsqlQueryBuilder.buildLibsqlChunksQuadIdIndex());
  await client.execute(testLibsqlQueryBuilder.buildLibsqlChunksFtsTable());
  await client.execute(testLibsqlQueryBuilder.buildLibsqlChunksIndex());
  for (const triggerSql of testLibsqlQueryBuilder.buildLibsqlChunksTriggers()) {
    await client.execute(triggerSql);
  }
}

const sharedSplitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000 });

Deno.test("commitPatchToLibsql - isolated writes and removals commit correctly to BOTH chunks and quads", async () => {
  const client = createClient({ url: ":memory:" });
  await setupSchema(client);

  const options = {
    client,
    embeddingService: new FakeEmbeddingService(),
    textSplitter: sharedSplitter,
    libsqlQueryBuilder: testLibsqlQueryBuilder,
  };

  const testQuad = quad(
    namedNode("urn:subject"),
    namedNode("urn:predicate"),
    literal("Content for synchronization tests"),
  );

  // 1. Commit insertion
  await commitPatchToLibsql({
    insertions: [testQuad],
    deletions: [],
  }, options);

  // 2. Verify both Tables updated
  let chunkRows = await client.execute("SELECT COUNT(*) as total FROM chunks");
  assertEquals(
    chunkRows.rows[0].total,
    1,
    "Expected one chunk written to index",
  );

  let quadRows = await client.execute("SELECT COUNT(*) as total FROM quads");
  assertEquals(
    quadRows.rows[0].total,
    1,
    "Expected exact master quad record replicated",
  );

  // 3. Execute deletion
  await commitPatchToLibsql({
    insertions: [],
    deletions: [testQuad],
  }, options);

  // 4. Verify holistic cleared state
  chunkRows = await client.execute("SELECT COUNT(*) as total FROM chunks");
  assertEquals(chunkRows.rows[0].total, 0, "Index cleanup failed");

  quadRows = await client.execute("SELECT COUNT(*) as total FROM quads");
  assertEquals(quadRows.rows[0].total, 0, "Master quad cleanup failed");
});

Deno.test("commitPatchToLibsql - supports synchronization when embeddingService is omitted (vector column left null)", async () => {
  const client = createClient({ url: ":memory:" });
  await setupSchema(client);

  const options = {
    client,
    // embeddingService is omitted intentionally
    textSplitter: sharedSplitter,
    libsqlQueryBuilder: testLibsqlQueryBuilder,
  };

  const testQuad = quad(
    namedNode("urn:subject"),
    namedNode("urn:predicate"),
    literal("Vectorless searchable text node"),
  );

  // Commit insertion
  await commitPatchToLibsql({
    insertions: [testQuad],
    deletions: [],
  }, options);

  // Verify that the chunk table has the row but with vector null
  const chunkRows = await client.execute("SELECT value, vector FROM chunks");
  assertEquals(
    chunkRows.rows.length,
    1,
    "Expected one chunk written to standard FTS index",
  );
  assertEquals(chunkRows.rows[0].value, "Vectorless searchable text node");
  assertEquals(
    chunkRows.rows[0].vector,
    null,
    "The vector data should remain null due to omitted adapter",
  );

  // Confirm parent quad still inserted
  const quadRows = await client.execute("SELECT COUNT(*) as total FROM quads");
  assertEquals(quadRows.rows[0].total, 1);
});

Deno.test(
  "commitPatchToLibsql - bulk insertions beyond SQLITE_MAX_VARIABLE_NUMBER do not fail",
  async () => {
    const client = createClient({ url: ":memory:" });
    await setupSchema(client);

    const bulkQuadCount = 2_500;
    const bulkQuads = Array.from({ length: bulkQuadCount }, (_, index) =>
      quad(
        namedNode(`urn:bulk:entity:${index}`),
        namedNode("urn:bulk:predicate"),
        literal(`bulk literal ${index}`),
      ));

    const options = {
      client,
      textSplitter: sharedSplitter,
      libsqlQueryBuilder: testLibsqlQueryBuilder,
    };

    await commitPatchToLibsql({
      insertions: bulkQuads,
      deletions: [],
    }, options);

    const quadRows = await client.execute(
      "SELECT COUNT(*) as total FROM quads",
    );
    assertEquals(Number(quadRows.rows[0].total), bulkQuadCount);
  },
);
