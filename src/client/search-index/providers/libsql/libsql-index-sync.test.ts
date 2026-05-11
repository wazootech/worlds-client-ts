import { assertEquals } from "@std/assert";
import { createClient } from "@libsql/client";
import { DataFactory } from "n3";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { LibsqlIndexSync } from "./libsql-index-sync.ts";
import { QuadChunker } from "#/client/search-index/chunking/quad-chunker.ts";
import {
  makeLibsqlChunksQuadIdIndex,
  makeLibsqlChunksFtsTable,
  makeLibsqlChunksIndex,
  makeLibsqlChunksTable,
  makeLibsqlChunksTriggers,
} from "./statements.ts";

const { quad, namedNode, literal } = DataFactory;

async function setupSchema(client: ReturnType<typeof createClient>) {
  await client.execute(makeLibsqlChunksTable());
  await client.execute(makeLibsqlChunksQuadIdIndex());
  await client.execute(makeLibsqlChunksFtsTable());
  await client.execute(makeLibsqlChunksIndex());
  for (const triggerSql of makeLibsqlChunksTriggers()) {
    await client.execute(triggerSql);
  }
}

class FakeEmbedder {
  embed(_text: string): Promise<Float32Array> {
    const data = new Array(32).fill(0);
    data[0] = 1.0;
    return Promise.resolve(new Float32Array(data));
  }
}

const sharedSplitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000 });
const sharedChunker = new QuadChunker({ splitter: sharedSplitter });

Deno.test("LibsqlIndexSync - isolated writes and removals flush correctly", async () => {
  const client = createClient({ url: ":memory:" });
  await setupSchema(client);

  const synchronizer = new LibsqlIndexSync({
    client,
    embeddingService: new FakeEmbedder(),
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

  // 2. Verify raw SQL count has exactly 1 row in chunk database
  let rows = await client.execute("SELECT COUNT(*) as total FROM chunks");
  assertEquals(rows.rows[0].total, 1, "Expected one chunk written to physical DB");

  // 3. Execute deletion
  await synchronizer.sync({
    insertions: [],
    deletions: [testQuad],
  });

  // 4. Verify cleared
  rows = await client.execute("SELECT COUNT(*) as total FROM chunks");
  assertEquals(rows.rows[0].total, 0, "Expected physical row cleanup");
});
