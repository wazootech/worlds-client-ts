import { assertEquals, assertExists } from "@std/assert";
import { createClient } from "@libsql/client";
import { DataFactory } from "n3";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { LibsqlSearchIndex } from "./libsql-search-index.ts";
import { QuadChunker } from "#/client/search-index/chunking/quad-chunker.ts";
import {
  makeLibsqlChunksFactIdIndex,
  makeLibsqlChunksFtsTable,
  makeLibsqlChunksIndex,
  makeLibsqlChunksTable,
  makeLibsqlChunksTriggers,
} from "./statements.ts";

const { quad, namedNode, literal } = DataFactory;

// --- Helpers ---

async function setupSchema(client: ReturnType<typeof createClient>) {
  await client.execute(makeLibsqlChunksTable());
  await client.execute(makeLibsqlChunksFactIdIndex());
  await client.execute(makeLibsqlChunksFtsTable());
  await client.execute(makeLibsqlChunksIndex());
  for (const triggerSql of makeLibsqlChunksTriggers()) {
    await client.execute(triggerSql);
  }
}

class FakeEmbedder {
  embed(_text: string): Promise<Float32Array> {
    // Fake matching vector dimensions of F32_BLOB(32) defined in utils, padded out
    const data = new Array(32).fill(0);
    data[0] = 1.0;
    return Promise.resolve(new Float32Array(data));
  }
}

const sharedSplitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000 });
const sharedChunker = new QuadChunker({ splitter: sharedSplitter });

// --- Tests ---

Deno.test("LibsqlSearchIndex - Tracer Bullet: performs basic hybrid search and maps results", async () => {
  const client = createClient({ url: ":memory:" });
  await setupSchema(client);

  const paddedVec = new Array(32).fill(0);
  paddedVec[0] = 1.0;
  const vecStr = JSON.stringify(paddedVec);

  await client.execute({
    sql:
      `INSERT INTO chunks (fact_id, subject, predicate, value, vector) VALUES (?, ?, ?, ?, vector32(?))`,
    args: [
      "f1",
      "urn:alice",
      "urn:name",
      "Alice is the explorer",
      vecStr,
    ],
  });

  const otherVec = [...paddedVec];
  otherVec[1] = 1.0;
  const otherVecStr = JSON.stringify(otherVec);

  await client.execute({
    sql:
      `INSERT INTO chunks (fact_id, subject, predicate, value, vector) VALUES (?, ?, ?, ?, vector32(?))`,
    args: [
      "f2",
      "urn:bob",
      "urn:name",
      "Bob stays back",
      otherVecStr,
    ],
  });

  const searchIndex = new LibsqlSearchIndex({
    client,
    embeddingService: new FakeEmbedder(),
    chunker: sharedChunker,
  });

  const response = await searchIndex.search({ query: "Alice" });

  assertExists(response.results);
  const first = response.results[0];
  assertExists(first, "Expected at least one result.");
  assertEquals(first.subject, "urn:alice");
  assertEquals(first.predicate, "urn:name");
  assertEquals(first.text, "Alice is the explorer");
  assertEquals(typeof first.score, "number");
});

Deno.test("LibsqlSearchIndex - Scope Inclusion: limits matches only to included subjects", async () => {
  const client = createClient({ url: ":memory:" });
  await setupSchema(client);

  const data = new Array(32).fill(0);
  data[0] = 1.0;
  const vecStr = JSON.stringify(data);

  await client.execute({
    sql:
      `INSERT INTO chunks (fact_id, subject, predicate, value, vector) VALUES (?, ?, ?, ?, vector32(?))`,
    args: ["f1", "urn:person:1", "urn:bio", "Loves coding and data", vecStr],
  });
  await client.execute({
    sql:
      `INSERT INTO chunks (fact_id, subject, predicate, value, vector) VALUES (?, ?, ?, ?, vector32(?))`,
    args: ["f2", "urn:person:2", "urn:bio", "Loves coding and gardening", vecStr],
  });

  const searchIndex = new LibsqlSearchIndex({
    client,
    embeddingService: new FakeEmbedder(),
    chunker: sharedChunker,
  });

  const base = await searchIndex.search({ query: "coding" });
  assertEquals(
    base.results?.length,
    2,
    "Baseline should find both coding references",
  );

  const filtered = await searchIndex.search({
    query: "coding",
    include: {
      subjects: ["urn:person:2"],
    },
  });

  assertEquals(
    filtered.results?.length,
    1,
    "Should return exactly one filtered match",
  );
  assertEquals(filtered.results?.[0].subject, "urn:person:2");
});

Deno.test("LibsqlSearchIndex - Scope Exclusion: suppresses explicitly excluded predicates", async () => {
  const client = createClient({ url: ":memory:" });
  await setupSchema(client);

  const data = new Array(32).fill(0);
  data[0] = 1.0;
  const vecStr = JSON.stringify(data);

  await client.execute({
    sql:
      `INSERT INTO chunks (fact_id, subject, predicate, value, vector) VALUES (?, ?, ?, ?, vector32(?))`,
    args: ["f1", "urn:e1", "urn:allowed", "Match text", vecStr],
  });
  await client.execute({
    sql:
      `INSERT INTO chunks (fact_id, subject, predicate, value, vector) VALUES (?, ?, ?, ?, vector32(?))`,
    args: ["f2", "urn:e1", "urn:forbidden", "Match text", vecStr],
  });

  const searchIndex = new LibsqlSearchIndex({
    client,
    embeddingService: new FakeEmbedder(),
    chunker: sharedChunker,
  });

  const response = await searchIndex.search({
    query: "Match",
    exclude: {
      predicates: ["urn:forbidden"],
    },
  });

  assertEquals(
    response.results?.length,
    1,
    "Only non-excluded predicate should remain",
  );
  assertEquals(response.results?.[0].predicate, "urn:allowed");
});

Deno.test("LibsqlSearchIndex - Lifecycle: integrates PatchHandler writing and safe sweeping", async () => {
  const client = createClient({ url: ":memory:" });
  await setupSchema(client);

  const searchIndex = new LibsqlSearchIndex({
    client,
    embeddingService: new FakeEmbedder(),
    chunker: sharedChunker,
  });

  const testQuad = quad(
    namedNode("urn:subject"),
    namedNode("urn:predicate"),
    literal("Initial creation content"),
  );

  // 1. Assert empty baseline
  const baseline = await searchIndex.search({ query: "Initial" });
  assertEquals(baseline.results?.length ?? 0, 0, "Empty db should yield no search hits");

  // 2. Perform patch write (insertion)
  await searchIndex.patch([{
    insertions: [testQuad],
    deletions: [],
  }]);

  // 3. Assert searchable now
  const written = await searchIndex.search({ query: "Initial" });
  assertEquals(written.results?.length, 1, "Successfully written quad should show in search");
  assertEquals(written.results?.[0].text, "Initial creation content");

  // 4. Perform patch delete
  await searchIndex.patch([{
    insertions: [],
    deletions: [testQuad],
  }]);

  // 5. Assert cleaned up
  const final = await searchIndex.search({ query: "Initial" });
  assertEquals(final.results?.length ?? 0, 0, "Deleted quad must be wiped from indices");
});
