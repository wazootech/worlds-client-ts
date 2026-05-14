import { assertEquals } from "@std/assert";
import { DataFactory, Store } from "n3";
import { DenokvQuadStore } from "./denokv-quad-store.ts";

const { namedNode, literal, quad } = DataFactory;

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

Deno.test("DenokvQuadStore.import - [Tracer Bullet] merge mode stores and exports a quad", async () => {
  const kv = await Deno.openKv(":memory:");
  const store = new DenokvQuadStore({ kv });

  try {
    // 1. Import a quad
    await store.import({
      mode: "merge",
      source: {
        kind: "quads",
        quads: [q1],
      },
    });

    // 2. Export the quad
    const response = await store.export({
      format: { kind: "quads" },
    });

    if (response.kind !== "quads") {
      throw new Error("Expected quads format response");
    }

    // 3. Verify
    assertEquals(response.quads.length, 1);
    assertEquals(response.quads[0].subject.value, q1.subject.value);
    assertEquals(response.quads[0].predicate.value, q1.predicate.value);
    assertEquals(response.quads[0].object.value, q1.object.value);
  } finally {
    kv.close();
  }
});

Deno.test("DenokvQuadStore.import - replace mode wipes existing data before importing", async () => {
  const kv = await Deno.openKv(":memory:");
  const store = new DenokvQuadStore({ kv });

  try {
    await store.import({
      mode: "merge",
      source: { kind: "quads", quads: [q1] },
    });

    await store.import({
      mode: "replace",
      source: { kind: "quads", quads: [q2] },
    });

    const response = await store.export({
      format: { kind: "quads" },
    });

    if (response.kind !== "quads") {
      throw new Error("Expected quads format");
    }

    assertEquals(response.quads.length, 1);
    assertEquals(response.quads[0].subject.value, q2.subject.value);
  } finally {
    kv.close();
  }
});

Deno.test("DenokvQuadStore.import - source: dataset handles DatasetCore objects", async () => {
  const kv = await Deno.openKv(":memory:");
  const store = new DenokvQuadStore({ kv });

  try {
    const dataset = new Store();
    dataset.add(q1);
    dataset.add(q2);

    await store.import({
      source: { kind: "dataset", dataset },
    });

    const response = await store.export({ format: { kind: "quads" } });
    if (response.kind !== "quads") throw new Error();

    assertEquals(response.quads.length, 2);
  } finally {
    kv.close();
  }
});

Deno.test("DenokvQuadStore.import - source: serialized parses Turtle successfully", async () => {
  const kv = await Deno.openKv(":memory:");
  const store = new DenokvQuadStore({ kv });

  try {
    const turtle = `<http://example.org/s3> <http://example.org/p3> "value" .`;
    await store.import({
      source: {
        kind: "serialized",
        data: turtle,
        contentType: "text/turtle",
      },
    });

    const response = await store.export({ format: { kind: "quads" } });
    if (response.kind !== "quads") throw new Error();

    assertEquals(response.quads.length, 1);
    assertEquals(response.quads[0].subject.value, "http://example.org/s3");
  } finally {
    kv.close();
  }
});

Deno.test("DenokvQuadStore.export - returns serialized dump", async () => {
  const kv = await Deno.openKv(":memory:");
  const store = new DenokvQuadStore({ kv });

  try {
    await store.import({
      source: { kind: "quads", quads: [q1] },
    });

    const response = await store.export({
      format: { kind: "serialized", contentType: "text/turtle" },
    });

    if (response.kind !== "serialized") throw new Error("Expected serialized");
    assertEquals(response.contentType, "text/turtle");
    assertEquals(response.data.includes("value1"), true);
  } finally {
    kv.close();
  }
});
