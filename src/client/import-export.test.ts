import { assertEquals, assertRejects } from "@std/assert";
import { DataFactory, Store } from "n3";
import { executeExport, executeImport } from "./import-export.ts";

const { namedNode, quad, literal } = DataFactory;

// Test quads
const q1 = quad(
  namedNode("http://example.org/s1"),
  namedNode("http://example.org/p1"),
  literal("value1"),
);
const q2 = quad(
  namedNode("http://example.org/s2"),
  namedNode("http://example.org/p2"),
  literal("value2"),
);

Deno.test("executeImport - merge mode combines quads without deleting existing", async () => {
  const store = new Store();
  store.add(q1);

  await executeImport(store, {
    mode: "merge",
    source: {
      kind: "quads",
      quads: [q2],
    },
  });

  assertEquals(store.size, 2);
  assertEquals(store.has(q1), true);
  assertEquals(store.has(q2), true);
});

Deno.test("executeImport - replace mode wipes existing data before importing", async () => {
  const store = new Store();
  store.add(q1);

  await executeImport(store, {
    mode: "replace",
    source: {
      kind: "quads",
      quads: [q2],
    },
  });

  assertEquals(store.size, 1);
  assertEquals(store.has(q1), false);
  assertEquals(store.has(q2), true);
});

Deno.test("executeImport - source: dataset handles DatasetCore objects", async () => {
  const targetStore = new Store();
  const sourceDataset = new Store();
  sourceDataset.add(q1);
  sourceDataset.add(q2);

  await executeImport(targetStore, {
    source: {
      kind: "dataset",
      dataset: sourceDataset,
    },
  });

  assertEquals(targetStore.size, 2);
});

Deno.test("executeImport - source: serialized parses Turtle successfully", async () => {
  const store = new Store();
  const turtle = `<http://example.org/s3> <http://example.org/p3> "value" .`;

  await executeImport(store, {
    source: {
      kind: "serialized",
      data: turtle,
      contentType: "text/turtle",
    },
  });

  assertEquals(store.size, 1);
});

Deno.test("executeImport - source: serialized defaults to N-Quads", async () => {
  const store = new Store();
  const nQuads =
    `<http://example.org/s4> <http://example.org/p4> <http://example.org/o4> <http://example.org/g4> .`;
  await executeImport(store, {
    source: { kind: "serialized", data: nQuads },
  });
  assertEquals(store.size, 1);
});

Deno.test("executeImport - replace mode combined with serialized data clears", async () => {
  const store = new Store();
  store.add(q1);
  await executeImport(store, {
    mode: "replace",
    source: {
      kind: "serialized",
      data: `<http://new> <http://new> "new" .`,
      contentType: "text/turtle",
    },
  });
  assertEquals(store.size, 1);
  assertEquals(store.has(q1), false);
});

Deno.test("executeImport - invalid serialization rejects properly", async () => {
  const store = new Store();

  await assertRejects(async () => {
    await executeImport(store, {
      source: {
        kind: "serialized",
        data: "GARBAGE SNOT@@$",
        contentType: "text/turtle",
      },
    });
  });
});

Deno.test("executeImport - omitting mode defaults to merge", async () => {
  const store = new Store();
  store.add(q1);

  await executeImport(store, {
    source: {
      kind: "quads",
      quads: [q2],
    },
  });

  assertEquals(store.size, 2);
});

Deno.test("executeExport - returns all store quads directly", async () => {
  const store = new Store();
  store.add(q1);

  const response = await executeExport(store, {
    format: { kind: "quads" },
  });

  if (response.kind !== "quads") throw new Error("Expected kind quads");
  assertEquals(response.quads.length, 1);
});

Deno.test("executeExport - returns serialized dump", async () => {
  const store = new Store();
  store.add(q1);

  const response = await executeExport(store, {
    format: { kind: "serialized", contentType: "text/turtle" },
  });

  if (response.kind !== "serialized") throw new Error("Expected serialized");
  assertEquals(response.contentType, "text/turtle");
  assertEquals(response.data.includes("value1"), true);
});
