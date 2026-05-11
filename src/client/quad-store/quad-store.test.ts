import { assertEquals, assertExists, assertRejects } from "@std/assert";
import { DataFactory, Store } from "n3";
import { RdfjsQuadStore } from "./quad-store.ts";

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

Deno.test("RdfjsQuadStore.import - merge mode combines quads without deleting existing", async () => {
  const store = new Store();
  store.add(q1);

  await new RdfjsQuadStore(store).import({
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

Deno.test("RdfjsQuadStore.import - replace mode wipes existing data before importing", async () => {
  const store = new Store();
  store.add(q1);

  await new RdfjsQuadStore(store).import({
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

Deno.test("RdfjsQuadStore.import - source: dataset handles DatasetCore objects", async () => {
  const targetStore = new Store();
  const sourceDataset = new Store();
  sourceDataset.add(q1);
  sourceDataset.add(q2);

  await new RdfjsQuadStore(targetStore).import({
    source: {
      kind: "dataset",
      dataset: sourceDataset,
    },
  });

  assertEquals(targetStore.size, 2);
});

Deno.test("RdfjsQuadStore.import - source: serialized parses Turtle successfully", async () => {
  const store = new Store();
  const turtle = `<http://example.org/s3> <http://example.org/p3> "value" .`;

  await new RdfjsQuadStore(store).import({
    source: {
      kind: "serialized",
      data: turtle,
      contentType: "text/turtle",
    },
  });

  assertEquals(store.size, 1);
});

Deno.test("RdfjsQuadStore.import - source: serialized defaults to N-Quads", async () => {
  const store = new Store();
  const nQuads =
    `<http://example.org/s4> <http://example.org/p4> <http://example.org/o4> <http://example.org/g4> .`;
  await new RdfjsQuadStore(store).import({
    source: { kind: "serialized", data: nQuads },
  });
  assertEquals(store.size, 1);
});

Deno.test("RdfjsQuadStore.import - replace mode combined with serialized data clears", async () => {
  const store = new Store();
  store.add(q1);
  await new RdfjsQuadStore(store).import({
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

Deno.test("RdfjsQuadStore.import - invalid serialization rejects properly", async () => {
  const store = new Store();

  await assertRejects(async () => {
    await new RdfjsQuadStore(store).import({
      source: {
        kind: "serialized",
        data: "GARBAGE SNOT@@$",
        contentType: "text/turtle",
      },
    });
  });
});

Deno.test("RdfjsQuadStore.import - omitting mode defaults to merge", async () => {
  const store = new Store();
  store.add(q1);

  await new RdfjsQuadStore(store).import({
    source: {
      kind: "quads",
      quads: [q2],
    },
  });

  assertEquals(store.size, 2);
});

Deno.test("RdfjsQuadStore.export - returns all store quads directly", async () => {
  const store = new Store();
  store.add(q1);

  const response = await new RdfjsQuadStore(store).export({
    format: { kind: "quads" },
  });

  if (response.kind !== "quads") throw new Error("Expected kind quads");
  assertEquals(response.quads.length, 1);
});

Deno.test("RdfjsQuadStore.export - returns serialized dump", async () => {
  const store = new Store();
  store.add(q1);

  const response = await new RdfjsQuadStore(store).export({
    format: { kind: "serialized", contentType: "text/turtle" },
  });

  if (response.kind !== "serialized") throw new Error("Expected serialized");
  assertEquals(response.contentType, "text/turtle");
  assertEquals(response.data.includes("value1"), true);
});

Deno.test("RdfjsQuadStore.import - notifies PatchHandlers upon successful insertions", async () => {
  const store = new Store();
  let capturedPatch: any = null;
  
  const handler = {
    patch: async (patches: any[]) => {
      capturedPatch = patches[0];
    }
  };

  const rdfStore = new RdfjsQuadStore(store, [handler]);
  
  await rdfStore.import({
    source: {
      kind: "quads",
      quads: [q1, q2]
    }
  });

  assertExists(capturedPatch);
  assertEquals(capturedPatch.insertions.length, 2);
  assertEquals(capturedPatch.deletions.length, 0);
});

Deno.test("RdfjsQuadStore.import - replace mode successfully communicates deletions", async () => {
  const store = new Store();
  store.add(q1); // Existing baseline
  let capturedPatch: any = null;
  
  const handler = {
    patch: async (patches: any[]) => {
      capturedPatch = patches[0];
    }
  };

  const rdfStore = new RdfjsQuadStore(store, [handler]);
  
  await rdfStore.import({
    mode: "replace",
    source: {
      kind: "quads",
      quads: [q2]
    }
  });

  assertExists(capturedPatch);
  assertEquals(capturedPatch.deletions.length, 1, "Should have captured preexisting quad before clearance");
  assertEquals(capturedPatch.insertions.length, 1, "Should have captured incoming replacement quad");
  assertEquals(capturedPatch.deletions[0].object.value, "value1");
  assertEquals(capturedPatch.insertions[0].object.value, "value2");
});
