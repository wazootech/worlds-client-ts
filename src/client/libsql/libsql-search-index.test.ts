import { assertEquals, assertExists } from "@std/assert";
import { createClient } from "@libsql/client";
import { LibsqlSearchIndex } from "./libsql-search-index.ts";
import {
  makeLibsqlChunksFtsTable,
  makeLibsqlChunksIndex,
  makeLibsqlChunksTable,
  makeLibsqlChunksTrigger,
} from "./utils.ts";

// --- Helpers ---

async function setupSchema(client: ReturnType<typeof createClient>) {
  // Use central utilities from utils.ts
  await client.execute(makeLibsqlChunksTable());
  await client.execute(makeLibsqlChunksFtsTable());
  await client.execute(makeLibsqlChunksTrigger());
  await client.execute(makeLibsqlChunksIndex());
}

class FakeEmbedder {
  embed(_text: string): Promise<Float32Array> {
    // Fake matching vector dimensions of F32_BLOB(32) defined in utils, padded out
    const data = new Array(32).fill(0);
    data[0] = 1.0;
    return Promise.resolve(new Float32Array(data));
  }
}

// --- Tests ---

Deno.test("LibsqlSearchIndex - Tracer Bullet: performs basic hybrid search and maps results", async () => {
  const client = createClient({ url: ":memory:" });
  await setupSchema(client);

  const paddedVec = new Array(32).fill(0);
  paddedVec[0] = 1.0;
  const vecStr = JSON.stringify(paddedVec);

  await client.execute({
    sql:
      `INSERT INTO chunks (subject, predicate, value, vector) VALUES (?, ?, ?, vector32(?))`,
    args: [
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
      `INSERT INTO chunks (subject, predicate, value, vector) VALUES (?, ?, ?, vector32(?))`,
    args: [
      "urn:bob",
      "urn:name",
      "Bob stays back",
      otherVecStr,
    ],
  });

  const searchIndex = new LibsqlSearchIndex({
    client,
    embeddingService: new FakeEmbedder(),
  });

  const response = await searchIndex.search({ query: "Alice" });

  assertExists(response.results);
  const first = response.results[0];
  assertExists(first, "Expected at least one result.");
  assertEquals(first.subject, "urn:alice");
  assertEquals(first.predicate, "urn:name");
  assertEquals(first.object, "Alice is the explorer");
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
      `INSERT INTO chunks (subject, predicate, value, vector) VALUES (?, ?, ?, vector32(?))`,
    args: ["urn:person:1", "urn:bio", "Loves coding and data", vecStr],
  });
  await client.execute({
    sql:
      `INSERT INTO chunks (subject, predicate, value, vector) VALUES (?, ?, ?, vector32(?))`,
    args: ["urn:person:2", "urn:bio", "Loves coding and gardening", vecStr],
  });

  const searchIndex = new LibsqlSearchIndex({
    client,
    embeddingService: new FakeEmbedder(),
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
      `INSERT INTO chunks (subject, predicate, value, vector) VALUES (?, ?, ?, vector32(?))`,
    args: ["urn:e1", "urn:allowed", "Match text", vecStr],
  });
  await client.execute({
    sql:
      `INSERT INTO chunks (subject, predicate, value, vector) VALUES (?, ?, ?, vector32(?))`,
    args: ["urn:e1", "urn:forbidden", "Match text", vecStr],
  });

  const searchIndex = new LibsqlSearchIndex({
    client,
    embeddingService: new FakeEmbedder(),
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
