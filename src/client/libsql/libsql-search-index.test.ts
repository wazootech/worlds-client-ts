import { assertEquals, assertExists } from "@std/assert";
import { createClient } from "@libsql/client";
import { LibsqlSearchIndex } from "./libsql-search-index.ts";

// --- Helpers ---

async function setupSchema(client: ReturnType<typeof createClient>) {
  // 1. Create backing facts table
  await client.execute(`
    CREATE TABLE IF NOT EXISTS facts (
      item_id TEXT NOT NULL,
      property TEXT NOT NULL,
      value TEXT NOT NULL,
      vector F32_BLOB(3)
    )
  `);

  // 2. Create FTS virtual table referencing facts
  await client.execute(`
    CREATE VIRTUAL TABLE IF NOT EXISTS facts_fts USING fts5(
      value,
      content='facts',
      content_rowid='rowid'
    )
  `);

  // 3. Add auto-sync triggers for FTS
  await client.execute(`
    CREATE TRIGGER IF NOT EXISTS facts_ai AFTER INSERT ON facts BEGIN
      INSERT INTO facts_fts(rowid, value) VALUES (new.rowid, new.value);
    END;
  `);

  // 4. Create LibSQL native vector index
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_facts_vector ON facts (
      libsql_vector_idx(vector, 'metric=cosine')
    )
  `);
}

class FakeEmbedder {
  async embed(_text: string): Promise<Float32Array> {
    // Static dummy vector [1.0, 0.0, 0.0]
    return new Float32Array([1.0, 0.0, 0.0]);
  }
}

function float32ArrayToBlob(arr: Float32Array): Uint8Array {
  return new Uint8Array(arr.buffer);
}

// --- Tests ---

Deno.test("LibsqlSearchIndex - Tracer Bullet: performs basic hybrid search and maps results", async () => {
  const client = createClient({ url: ":memory:" });
  await setupSchema(client);

  // Seed fixture data
  // Use standard vector insertion format for LibSQL (F32_BLOB expects binary blob or vector32 string)
  const aliceVec = new Float32Array([1.0, 0.0, 0.0]);
  await client.execute({
    sql:
      `INSERT INTO facts (item_id, property, value, vector) VALUES (?, ?, ?, vector32(?))`,
    args: [
      "urn:alice",
      "urn:name",
      "Alice is the explorer",
      JSON.stringify(Array.from(aliceVec)),
    ],
  });

  const bobVec = new Float32Array([0.0, 1.0, 0.0]);
  await client.execute({
    sql:
      `INSERT INTO facts (item_id, property, value, vector) VALUES (?, ?, ?, vector32(?))`,
    args: [
      "urn:bob",
      "urn:name",
      "Bob stays back",
      JSON.stringify(Array.from(bobVec)),
    ],
  });

  const searchIndex = new LibsqlSearchIndex({
    client,
    embeddingService: new FakeEmbedder(),
  });

  const response = await searchIndex.search({ query: "Alice" });

  assertExists(response.results);
  // We expect Alice to be returned as the primary match
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

  const vec = new Float32Array([1.0, 0.0, 0.0]);
  const vecStr = JSON.stringify(Array.from(vec));

  // Load multiple records sharing same query content
  await client.execute({
    sql:
      `INSERT INTO facts (item_id, property, value, vector) VALUES (?, ?, ?, vector32(?))`,
    args: ["urn:person:1", "urn:bio", "Loves coding and data", vecStr],
  });
  await client.execute({
    sql:
      `INSERT INTO facts (item_id, property, value, vector) VALUES (?, ?, ?, vector32(?))`,
    args: ["urn:person:2", "urn:bio", "Loves coding and gardening", vecStr],
  });

  const searchIndex = new LibsqlSearchIndex({
    client,
    embeddingService: new FakeEmbedder(),
  });

  // 1. Baseline search returns both
  const base = await searchIndex.search({ query: "coding" });
  assertEquals(
    base.results?.length,
    2,
    "Baseline should find both coding references",
  );

  // 2. Bound by subject inclusion: only return person:2
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

  const vecStr = JSON.stringify(Array.from(new Float32Array([1, 0, 0])));

  await client.execute({
    sql:
      `INSERT INTO facts (item_id, property, value, vector) VALUES (?, ?, ?, vector32(?))`,
    args: ["urn:e1", "urn:allowed", "Match text", vecStr],
  });
  await client.execute({
    sql:
      `INSERT INTO facts (item_id, property, value, vector) VALUES (?, ?, ?, vector32(?))`,
    args: ["urn:e1", "urn:forbidden", "Match text", vecStr],
  });

  const searchIndex = new LibsqlSearchIndex({
    client,
    embeddingService: new FakeEmbedder(),
  });

  // Exclude forbidden predicate
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
