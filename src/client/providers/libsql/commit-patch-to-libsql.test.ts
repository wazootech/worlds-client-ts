import { assertEquals } from "@std/assert";
import { createClient } from "@libsql/client";
import { DataFactory } from "n3";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { commitPatchToLibsql } from "./commit-patch-to-libsql.ts";
import { FakeEmbeddingService } from "#/client/search-index/embedding-service/mod.ts";
import { LibsqlQueryBuilder } from "./libsql-query-builder.ts";

const { quad, namedNode, literal } = DataFactory;

async function setupSchema(client: ReturnType<typeof createClient>) {
  await client.execute(LibsqlQueryBuilder.buildLibsqlQuadsTable()); // <--- Demand Quads Table exist
  await client.execute(LibsqlQueryBuilder.buildLibsqlChunksTable());
  await client.execute(LibsqlQueryBuilder.buildLibsqlChunksQuadIdIndex());
  await client.execute(LibsqlQueryBuilder.buildLibsqlChunksFtsTable());
  await client.execute(LibsqlQueryBuilder.buildLibsqlChunksIndex());
  for (const triggerSql of LibsqlQueryBuilder.buildLibsqlChunksTriggers()) {
    await client.execute(triggerSql);
  }
}

const sharedSplitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000 });

Deno.test("commitPatchToLibsql - isolated writes and removals flush correctly to BOTH chunks and quads", async () => {
  const client = createClient({ url: ":memory:" });
  await setupSchema(client);

  const options = {
    client,
    embeddingService: new FakeEmbeddingService(),
    textSplitter: sharedSplitter,
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
