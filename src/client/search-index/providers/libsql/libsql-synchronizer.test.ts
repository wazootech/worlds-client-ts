import { assertEquals } from "@std/assert";
import { createClient } from "@libsql/client";
import { DataFactory } from "n3";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { LibsqlSynchronizer } from "./libsql-synchronizer.ts";
import { FakeEmbeddingService } from "#/client/search-index/embedding-service/mod.ts";
import { QuadChunker } from "#/client/search-index/quad-chunker/quad-chunker.ts";
import {
  makeLibsqlChunksFtsTable,
  makeLibsqlChunksIndex,
  makeLibsqlChunksQuadIdIndex,
  makeLibsqlChunksTable,
  makeLibsqlChunksTriggers,
  makeLibsqlQuadsTable,
} from "./statements.ts";

const { quad, namedNode, literal } = DataFactory;

async function setupSchema(client: ReturnType<typeof createClient>) {
  await client.execute(makeLibsqlQuadsTable()); // <--- Demand Quads Table exist
  await client.execute(makeLibsqlChunksTable());
  await client.execute(makeLibsqlChunksQuadIdIndex());
  await client.execute(makeLibsqlChunksFtsTable());
  await client.execute(makeLibsqlChunksIndex());
  for (const triggerSql of makeLibsqlChunksTriggers()) {
    await client.execute(triggerSql);
  }
}

const sharedSplitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000 });
const sharedChunker = new QuadChunker({ splitter: sharedSplitter });

Deno.test("LibsqlSynchronizer - isolated writes and removals flush correctly to BOTH chunks and quads", async () => {
  const client = createClient({ url: ":memory:" });
  await setupSchema(client);

  const synchronizer = new LibsqlSynchronizer({
    client,
    embeddingService: new FakeEmbeddingService(),
    chunker: sharedChunker,
  });

  const testQuad = quad(
    namedNode("urn:subject"),
    namedNode("urn:predicate"),
    literal("Content for synchronization tests"),
  );

  // 1. Commit insertion
  await synchronizer.sync({
    insertions: [testQuad],
    deletions: [],
  });

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
  await synchronizer.sync({
    insertions: [],
    deletions: [testQuad],
  });

  // 4. Verify holistic cleared state
  chunkRows = await client.execute("SELECT COUNT(*) as total FROM chunks");
  assertEquals(chunkRows.rows[0].total, 0, "Index cleanup failed");

  quadRows = await client.execute("SELECT COUNT(*) as total FROM quads");
  assertEquals(quadRows.rows[0].total, 0, "Master quad cleanup failed");
});
