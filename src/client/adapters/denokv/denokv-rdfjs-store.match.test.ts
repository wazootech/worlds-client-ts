import { assertEquals } from "@std/assert";
import type * as rdfjs from "@rdfjs/types";
import { DataFactory } from "n3";
import { DenokvQuadStore } from "./denokv-quad-store.ts";
import { DenokvRdfjsStore } from "./denokv-rdfjs-store.ts";

const { namedNode, literal, blankNode, quad } = DataFactory;

async function seedQuads(
  kv: Deno.Kv,
  quads: rdfjs.Quad[],
  options?: { keyPrefix?: Deno.KvKey },
): Promise<void> {
  const quadStore = new DenokvQuadStore({ kv, keyPrefix: options?.keyPrefix });
  await quadStore.import({
    mode: "merge",
    source: { kind: "quads", quads },
  });
}

function collectMatch(
  store: DenokvRdfjsStore,
  subject?: rdfjs.Term | null,
  predicate?: rdfjs.Term | null,
  object?: rdfjs.Term | null,
  graph?: rdfjs.Term | null,
): Promise<rdfjs.Quad[]> {
  return new Promise((resolve, reject) => {
    const quads: rdfjs.Quad[] = [];
    const stream = store.match(subject, predicate, object, graph);
    stream.on("data", (q: rdfjs.Quad) => quads.push(q));
    stream.on("end", () => resolve(quads));
    stream.on("error", reject);
  });
}

Deno.test("DenokvRdfjsStore.match - empty store returns empty stream", async () => {
  const kv = await Deno.openKv(":memory:");
  try {
    const store = new DenokvRdfjsStore({ kv });
    const results = await collectMatch(store, null, null, null, null);
    assertEquals(results.length, 0);
  } finally {
    kv.close();
  }
});

Deno.test("DenokvRdfjsStore.match - all four terms bound returns exact quad", async () => {
  const kv = await Deno.openKv(":memory:");
  try {
    await seedQuads(kv, [
      quad(
        namedNode("urn:alice"),
        namedNode("urn:knows"),
        namedNode("urn:bob"),
        namedNode("urn:graph1"),
      ),
    ]);

    const store = new DenokvRdfjsStore({ kv });
    const results = await collectMatch(
      store,
      namedNode("urn:alice"),
      namedNode("urn:knows"),
      namedNode("urn:bob"),
      namedNode("urn:graph1"),
    );

    assertEquals(results.length, 1);
    assertEquals(results[0].subject.value, "urn:alice");
    assertEquals(results[0].subject.termType, "NamedNode");
    assertEquals(results[0].predicate.value, "urn:knows");
    assertEquals(results[0].object.value, "urn:bob");
    assertEquals(results[0].graph.value, "urn:graph1");
  } finally {
    kv.close();
  }
});

Deno.test("DenokvRdfjsStore.match - by subject only returns matching quads", async () => {
  const kv = await Deno.openKv(":memory:");
  try {
    await seedQuads(kv, [
      quad(namedNode("urn:a"), namedNode("urn:p1"), literal("o1")),
      quad(namedNode("urn:b"), namedNode("urn:p2"), literal("o2")),
      quad(namedNode("urn:a"), namedNode("urn:p3"), literal("o3")),
    ]);

    const store = new DenokvRdfjsStore({ kv });
    const results = await collectMatch(
      store,
      namedNode("urn:a"),
      null,
      null,
      null,
    );

    assertEquals(results.length, 2);
    for (const q of results) {
      assertEquals(q.subject.value, "urn:a");
    }
  } finally {
    kv.close();
  }
});

Deno.test("DenokvRdfjsStore.match - by predicate only uses PSO index", async () => {
  const kv = await Deno.openKv(":memory:");
  try {
    await seedQuads(kv, [
      quad(namedNode("urn:a"), namedNode("urn:target"), literal("o1")),
      quad(namedNode("urn:b"), namedNode("urn:other"), literal("o2")),
      quad(namedNode("urn:c"), namedNode("urn:target"), literal("o3")),
    ]);

    const store = new DenokvRdfjsStore({ kv });
    const results = await collectMatch(
      store,
      null,
      namedNode("urn:target"),
      null,
      null,
    );

    assertEquals(results.length, 2);
    for (const q of results) {
      assertEquals(q.predicate.value, "urn:target");
    }
  } finally {
    kv.close();
  }
});

Deno.test("DenokvRdfjsStore.match - by graph only uses GPSO index", async () => {
  const kv = await Deno.openKv(":memory:");
  try {
    await seedQuads(kv, [
      quad(
        namedNode("urn:a"),
        namedNode("urn:p"),
        literal("o1"),
        namedNode("urn:g1"),
      ),
      quad(
        namedNode("urn:b"),
        namedNode("urn:p"),
        literal("o2"),
        namedNode("urn:g2"),
      ),
    ]);

    const store = new DenokvRdfjsStore({ kv });
    const results = await collectMatch(
      store,
      null,
      null,
      null,
      namedNode("urn:g1"),
    );

    assertEquals(results.length, 1);
    assertEquals(results[0].graph.value, "urn:g1");
  } finally {
    kv.close();
  }
});

Deno.test("DenokvRdfjsStore.match - by object only uses OPSG index", async () => {
  const kv = await Deno.openKv(":memory:");
  try {
    await seedQuads(kv, [
      quad(namedNode("urn:a"), namedNode("urn:p"), literal("target")),
      quad(namedNode("urn:b"), namedNode("urn:p"), literal("other")),
    ]);

    const store = new DenokvRdfjsStore({ kv });
    const results = await collectMatch(
      store,
      null,
      null,
      literal("target"),
      null,
    );

    assertEquals(results.length, 1);
    assertEquals(results[0].object.value, "target");
  } finally {
    kv.close();
  }
});

Deno.test("DenokvRdfjsStore.match - disambiguates NamedNode vs BlankNode with same value", async () => {
  const kv = await Deno.openKv(":memory:");
  try {
    await seedQuads(kv, [
      quad(namedNode("b1"), namedNode("urn:p"), literal("o1")),
      quad(blankNode("b1"), namedNode("urn:p"), literal("o2")),
    ]);

    const store = new DenokvRdfjsStore({ kv });

    const namedResults = await collectMatch(
      store,
      namedNode("b1"),
      null,
      null,
      null,
    );
    assertEquals(namedResults.length, 1);
    assertEquals(namedResults[0].subject.termType, "NamedNode");

    const blankResults = await collectMatch(
      store,
      blankNode("b1"),
      null,
      null,
      null,
    );
    assertEquals(blankResults.length, 1);
    assertEquals(blankResults[0].subject.termType, "BlankNode");
  } finally {
    kv.close();
  }
});

Deno.test("DenokvRdfjsStore.match - literal with language tag", async () => {
  const kv = await Deno.openKv(":memory:");
  try {
    await seedQuads(kv, [
      quad(
        namedNode("urn:s"),
        namedNode("urn:p"),
        literal("hola", "es"),
      ),
    ]);

    const store = new DenokvRdfjsStore({ kv });
    const results = await collectMatch(
      store,
      namedNode("urn:s"),
      namedNode("urn:p"),
      null,
      null,
    );

    assertEquals(results.length, 1);
    assertEquals(results[0].object.termType, "Literal");
    const objectLiteral = results[0].object as rdfjs.Literal;
    assertEquals(objectLiteral.value, "hola");
    assertEquals(objectLiteral.language, "es");
  } finally {
    kv.close();
  }
});

Deno.test(
  "DenokvRdfjsStore.match - predicate-only still correct when only spog index enabled",
  async () => {
    const kv = await Deno.openKv(":memory:");
    try {
      await seedQuads(kv, [
        quad(namedNode("urn:a"), namedNode("urn:target"), literal("o1")),
        quad(namedNode("urn:b"), namedNode("urn:other"), literal("o2")),
      ]);

      const store = new DenokvRdfjsStore({
        kv,
        enabledHexastoreIndexes: ["spog"],
      });
      const results = await collectMatch(
        store,
        null,
        namedNode("urn:target"),
        null,
        null,
      );

      assertEquals(results.length, 1);
      assertEquals(results[0].predicate.value, "urn:target");
    } finally {
      kv.close();
    }
  },
);
