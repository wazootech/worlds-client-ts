import { assertEquals } from "@std/assert";
import { DataFactory, Store } from "n3";
import { applyImport } from "./import.ts";

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

Deno.test("applyImport - merge mode combines quads without deleting existing", async () => {
  const store = new Store();
  store.add(q1);

  await applyImport(store, {
    mode: "merge",
    source: {
      kind: "quads",
      quads: [q2],
    },
  });

  assertEquals(
    store.size,
    2,
    "Store should contain both the original and the new quad",
  );
  assertEquals(store.has(q1), true, "Original quad should still exist");
  assertEquals(store.has(q2), true, "New quad should be present");
});

Deno.test("applyImport - replace mode wipes existing data before importing", async () => {
  const store = new Store();
  store.add(q1);

  await applyImport(store, {
    mode: "replace",
    source: {
      kind: "quads",
      quads: [q2],
    },
  });

  assertEquals(
    store.size,
    1,
    "Store should only contain the newly imported quad",
  );
  assertEquals(store.has(q1), false, "Original quad should be gone");
  assertEquals(store.has(q2), true, "New quad should be present");
});

Deno.test("applyImport - source: dataset handles DatasetCore objects (e.g., other Stores)", async () => {
  const targetStore = new Store();

  const sourceDataset = new Store();
  sourceDataset.add(q1);
  sourceDataset.add(q2);

  await applyImport(targetStore, {
    mode: "merge",
    source: {
      kind: "dataset",
      dataset: sourceDataset,
    },
  });

  assertEquals(
    targetStore.size,
    2,
    "Should import both quads from the dataset object",
  );
  assertEquals(targetStore.has(q1), true);
  assertEquals(targetStore.has(q2), true);
});

Deno.test("applyImport - source: serialized parses strings correctly (Turtle)", async () => {
  const store = new Store();
  const turtlePayload =
    `<http://example.org/s3> <http://example.org/p3> "serialized_value" .`;

  await applyImport(store, {
    mode: "merge",
    source: {
      kind: "serialized",
      data: turtlePayload,
      contentType: "text/turtle",
    },
  });

  assertEquals(
    store.size,
    1,
    "Should contain exactly one quad parsed from the string",
  );

  const imported = store.getQuads(null, null, null, null)[0];
  assertEquals(imported.subject.value, "http://example.org/s3");
  assertEquals(imported.predicate.value, "http://example.org/p3");
  assertEquals(imported.object.value, "serialized_value");
});

Deno.test("applyImport - source: serialized uses application/n-quads as default", async () => {
  const store = new Store();
  const nQuadsPayload =
    `<http://example.org/s4> <http://example.org/p4> <http://example.org/o4> <http://example.org/g4> .`;

  await applyImport(store, {
    mode: "merge",
    source: {
      kind: "serialized",
      data: nQuadsPayload,
      // no contentType explicitly passed
    },
  });

  assertEquals(
    store.size,
    1,
    "Should parse successfully defaulting to N-Quads",
  );
  const imported = store.getQuads(null, null, null, null)[0];
  assertEquals(imported.graph.value, "http://example.org/g4");
});
