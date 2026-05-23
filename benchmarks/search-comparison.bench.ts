import { createClient } from "@libsql/client";
import { Store } from "n3";
import { RdfjsSearchIndex } from "@worlds/client/adapters/rdfjs";
import { LibsqlSearchIndex } from "@worlds/client/adapters/libsql";
import { createLibsqlN3ClientOptions } from "@worlds/client/adapters/libsql/n3";
import { defaultLibsqlQueryBuilder } from "@worlds/client/adapters/libsql";
import { Client } from "@worlds/client";
import { generateSyntheticQuads } from "./shared/synthetic-data.ts";

// -----------------------------------------------------------------------------
// TEST FIXTURE SETUP
// Pre-populate standard dataset populations to isolate query latencies.
// -----------------------------------------------------------------------------

async function prepareLibsqlSearchIndex(count: number) {
  const db = createClient({ url: ":memory:" });
  const client = new Client(
    await createLibsqlN3ClientOptions({ client: db }), // No embedding service -> Pure Keyword FTS Mode
  );

  // Batch ingestion in segments to prevent exceeding SQL statement variable caps
  const dataset = generateSyntheticQuads(count);
  await client.import({
    source: { kind: "quads", quads: dataset },
  });

  const searchIndex = new LibsqlSearchIndex({
    client: db,
    libsqlQueryBuilder: defaultLibsqlQueryBuilder,
  });
  return { searchIndex, db };
}

function prepareRdfjsSearchIndex(count: number) {
  const store = new Store();
  const dataset = generateSyntheticQuads(count);
  store.addQuads(dataset);
  const searchIndex = new RdfjsSearchIndex(store);
  return { searchIndex };
}

console.log("⏳ Pre-populating benchmark datasets (100, 1000, 10000)...");

// 100-Quad Datasets
const { searchIndex: libsqlSmall, db: _dbSmall } =
  await prepareLibsqlSearchIndex(100);
const { searchIndex: rdfjsSmall } = prepareRdfjsSearchIndex(100);

// 1,000-Quad Datasets
const { searchIndex: libsqlMed, db: _dbMed } = await prepareLibsqlSearchIndex(
  1000,
);
const { searchIndex: rdfjsMed } = prepareRdfjsSearchIndex(1000);

// 10,000-Quad Datasets
const { searchIndex: libsqlLarge, db: _dbLarge } =
  await prepareLibsqlSearchIndex(10000);
const { searchIndex: rdfjsLarge } = prepareRdfjsSearchIndex(10000);

console.log("✅ Datasets populated. Executing benchmarks...");

// -----------------------------------------------------------------------------
// SCALE 1: Small Dataset (100 Records)
// -----------------------------------------------------------------------------

Deno.bench({
  name: "Scale 100: LibSQL Specific Match (Pure FTS)",
  group: "Scale 100: Specific",
  async fn() {
    await libsqlSmall.search({ query: "SYNT-50" });
  },
});

Deno.bench({
  name: "Scale 100: RDF/JS Specific Match (Naive Stream Scan)",
  group: "Scale 100: Specific",
  async fn() {
    await rdfjsSmall.search({ query: "SYNT-50" });
  },
});

Deno.bench({
  name: "Scale 100: LibSQL Miss Query (Zero Matches)",
  group: "Scale 100: Miss",
  async fn() {
    await libsqlSmall.search({ query: "nonexistentwordxyz" });
  },
});

Deno.bench({
  name: "Scale 100: RDF/JS Miss Query (Zero Matches)",
  group: "Scale 100: Miss",
  async fn() {
    await rdfjsSmall.search({ query: "nonexistentwordxyz" });
  },
});

// -----------------------------------------------------------------------------
// SCALE 2: Medium Dataset (1,000 Records)
// -----------------------------------------------------------------------------

Deno.bench({
  name: "Scale 1k: LibSQL Specific Match (Pure FTS)",
  group: "Scale 1k: Specific",
  async fn() {
    await libsqlMed.search({ query: "SYNT-500" });
  },
});

Deno.bench({
  name: "Scale 1k: RDF/JS Specific Match (Naive Stream Scan)",
  group: "Scale 1k: Specific",
  async fn() {
    await rdfjsMed.search({ query: "SYNT-500" });
  },
});

Deno.bench({
  name: "Scale 1k: LibSQL Miss Query (Zero Matches)",
  group: "Scale 1k: Miss",
  async fn() {
    await libsqlMed.search({ query: "nonexistentwordxyz" });
  },
});

Deno.bench({
  name: "Scale 1k: RDF/JS Miss Query (Zero Matches)",
  group: "Scale 1k: Miss",
  async fn() {
    await rdfjsMed.search({ query: "nonexistentwordxyz" });
  },
});

// -----------------------------------------------------------------------------
// SCALE 3: Large Dataset (10,000 Records)
// -----------------------------------------------------------------------------

Deno.bench({
  name: "Scale 10k: LibSQL Specific Match (Pure FTS)",
  group: "Scale 10k: Specific",
  async fn() {
    await libsqlLarge.search({ query: "SYNT-5000" });
  },
});

Deno.bench({
  name: "Scale 10k: RDF/JS Specific Match (Naive Stream Scan)",
  group: "Scale 10k: Specific",
  async fn() {
    await rdfjsLarge.search({ query: "SYNT-5000" });
  },
});

Deno.bench({
  name: "Scale 10k: LibSQL Miss Query (Zero Matches)",
  group: "Scale 10k: Miss",
  async fn() {
    await libsqlLarge.search({ query: "nonexistentwordxyz" });
  },
});

Deno.bench({
  name: "Scale 10k: RDF/JS Miss Query (Zero Matches)",
  group: "Scale 10k: Miss",
  async fn() {
    await rdfjsLarge.search({ query: "nonexistentwordxyz" });
  },
});
