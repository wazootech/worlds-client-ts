import { assertEquals, assertRejects } from "@std/assert";
import type { Client } from "@libsql/client";
import { createClient } from "@libsql/client";
import { DataFactory } from "n3";
import type * as rdfjs from "@rdfjs/types";
import { Readable } from "node:stream";
import { LibsqlQueryBuilder } from "./libsql-query-builder.ts";
import { LibsqlStore } from "./libsql-store.ts";

const { namedNode, literal, blankNode, quad } = DataFactory;

const testBuilder = new LibsqlQueryBuilder(32);

async function setupSchema(db: ReturnType<typeof createClient>): Promise<void> {
  await db.execute(testBuilder.buildLibsqlQuadsTable());
  for (const ddl of testBuilder.buildHexastoreIndexes()) {
    await db.execute(ddl);
  }
}

interface SeedQuadOptions {
  id: string;
  s: string;
  s_type?: string;
  p: string;
  o: string;
  o_type?: string;
  o_datatype?: string | null;
  o_lang?: string | null;
  g?: string;
  g_type?: string;
}

async function seedQuad(
  db: ReturnType<typeof createClient>,
  options: SeedQuadOptions,
): Promise<void> {
  await db.execute({
    sql:
      `INSERT INTO quads (id, s, s_type, p, o, o_type, o_datatype, o_lang, g, g_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      options.id,
      options.s,
      options.s_type ?? "NamedNode",
      options.p,
      options.o,
      options.o_type ?? "Literal",
      options.o_datatype ?? null,
      options.o_lang ?? null,
      options.g ?? "",
      options.g_type ?? "DefaultGraph",
    ],
  });
}

function collectStream(
  stream: rdfjs.Stream<rdfjs.Quad>,
): Promise<rdfjs.Quad[]> {
  return new Promise((resolve, reject) => {
    const quads: rdfjs.Quad[] = [];
    stream.on("data", (q: rdfjs.Quad) => quads.push(q));
    stream.on("end", () => resolve(quads));
    stream.on("error", reject);
  });
}

// ──────────────────────────────────────────────────
// Phase 1: match() read tests
// ──────────────────────────────────────────────────

Deno.test("LibsqlStore.match - empty store returns empty stream", async () => {
  const db = createClient({ url: ":memory:" });
  await setupSchema(db);
  const store = new LibsqlStore(db, testBuilder);

  const results = await collectStream(store.match(null, null, null, null));
  assertEquals(results.length, 0);
});

Deno.test("LibsqlStore.match - all four terms bound returns exact quad", async () => {
  const db = createClient({ url: ":memory:" });
  await setupSchema(db);
  await seedQuad(db, {
    id: "hash1",
    s: "urn:alice",
    s_type: "NamedNode",
    p: "urn:knows",
    o: "urn:bob",
    o_type: "NamedNode",
    g: "urn:graph1",
    g_type: "NamedNode",
  });
  const store = new LibsqlStore(db, testBuilder);

  const results = await collectStream(store.match(
    namedNode("urn:alice"),
    namedNode("urn:knows"),
    namedNode("urn:bob"),
    namedNode("urn:graph1"),
  ));

  assertEquals(results.length, 1);
  assertEquals(results[0].subject.value, "urn:alice");
  assertEquals(results[0].subject.termType, "NamedNode");
  assertEquals(results[0].predicate.value, "urn:knows");
  assertEquals(results[0].object.value, "urn:bob");
  assertEquals(results[0].graph.value, "urn:graph1");
});

Deno.test("LibsqlStore.match - by subject only returns matching quads", async () => {
  const db = createClient({ url: ":memory:" });
  await setupSchema(db);
  await seedQuad(db, { id: "h1", s: "urn:a", p: "urn:p1", o: "o1" });
  await seedQuad(db, { id: "h2", s: "urn:b", p: "urn:p2", o: "o2" });
  await seedQuad(db, { id: "h3", s: "urn:a", p: "urn:p3", o: "o3" });
  const store = new LibsqlStore(db, testBuilder);

  const results = await collectStream(
    store.match(namedNode("urn:a"), null, null, null),
  );

  assertEquals(results.length, 2);
  for (const q of results) {
    assertEquals(q.subject.value, "urn:a");
  }
});

Deno.test("LibsqlStore.match - by predicate only uses PSO index", async () => {
  const db = createClient({ url: ":memory:" });
  await setupSchema(db);
  await seedQuad(db, { id: "h1", s: "urn:a", p: "urn:target", o: "o1" });
  await seedQuad(db, { id: "h2", s: "urn:b", p: "urn:other", o: "o2" });
  await seedQuad(db, { id: "h3", s: "urn:c", p: "urn:target", o: "o3" });
  const store = new LibsqlStore(db, testBuilder);

  const results = await collectStream(
    store.match(null, namedNode("urn:target"), null, null),
  );

  assertEquals(results.length, 2);
  for (const q of results) {
    assertEquals(q.predicate.value, "urn:target");
  }
});

Deno.test("LibsqlStore.match - by graph only uses GPSO index", async () => {
  const db = createClient({ url: ":memory:" });
  await setupSchema(db);
  await seedQuad(db, {
    id: "h1",
    s: "urn:a",
    p: "urn:p",
    o: "o1",
    g: "urn:g1",
    g_type: "NamedNode",
  });
  await seedQuad(db, {
    id: "h2",
    s: "urn:b",
    p: "urn:p",
    o: "o2",
    g: "urn:g2",
    g_type: "NamedNode",
  });
  const store = new LibsqlStore(db, testBuilder);

  const results = await collectStream(
    store.match(null, null, null, namedNode("urn:g1")),
  );

  assertEquals(results.length, 1);
  assertEquals(results[0].graph.value, "urn:g1");
});

Deno.test("LibsqlStore.match - by object only uses OPSG index", async () => {
  const db = createClient({ url: ":memory:" });
  await setupSchema(db);
  await seedQuad(db, {
    id: "h1",
    s: "urn:a",
    p: "urn:p",
    o: "target",
    o_type: "Literal",
  });
  await seedQuad(db, {
    id: "h2",
    s: "urn:b",
    p: "urn:p",
    o: "other",
    o_type: "Literal",
  });
  const store = new LibsqlStore(db, testBuilder);

  const results = await collectStream(
    store.match(null, null, literal("target"), null),
  );

  assertEquals(results.length, 1);
  assertEquals(results[0].object.value, "target");
});

Deno.test("LibsqlStore.match - disambiguates NamedNode vs BlankNode with same value", async () => {
  const db = createClient({ url: ":memory:" });
  await setupSchema(db);
  await seedQuad(db, {
    id: "h1",
    s: "b1",
    s_type: "NamedNode",
    p: "urn:p",
    o: "o1",
  });
  await seedQuad(db, {
    id: "h2",
    s: "b1",
    s_type: "BlankNode",
    p: "urn:p",
    o: "o2",
  });
  const store = new LibsqlStore(db, testBuilder);

  const namedResults = await collectStream(
    store.match(namedNode("b1"), null, null, null),
  );
  assertEquals(namedResults.length, 1);
  assertEquals(namedResults[0].subject.termType, "NamedNode");

  const blankResults = await collectStream(
    store.match(blankNode("b1"), null, null, null),
  );
  assertEquals(blankResults.length, 1);
  assertEquals(blankResults[0].subject.termType, "BlankNode");
});

Deno.test("LibsqlStore.match - literal with language tag", async () => {
  const db = createClient({ url: ":memory:" });
  await setupSchema(db);
  await seedQuad(db, {
    id: "h1",
    s: "urn:s",
    p: "urn:p",
    o: "hola",
    o_type: "Literal",
    o_lang: "es",
  });
  const store = new LibsqlStore(db, testBuilder);

  // Match by subject+p, then check the literal
  const results = await collectStream(
    store.match(namedNode("urn:s"), namedNode("urn:p"), null, null),
  );

  assertEquals(results.length, 1);
  assertEquals(results[0].object.termType, "Literal");
  const lit = results[0].object as rdfjs.Literal;
  assertEquals(lit.value, "hola");
  assertEquals(lit.language, "es");
});

Deno.test("LibsqlStore.match - literal with datatype", async () => {
  const db = createClient({ url: ":memory:" });
  await setupSchema(db);
  await seedQuad(db, {
    id: "h1",
    s: "urn:s",
    p: "urn:p",
    o: "42",
    o_type: "Literal",
    o_datatype: "http://www.w3.org/2001/XMLSchema#integer",
  });
  const store = new LibsqlStore(db, testBuilder);

  const results = await collectStream(
    store.match(namedNode("urn:s"), namedNode("urn:p"), null, null),
  );

  assertEquals(results.length, 1);
  const lit = results[0].object as rdfjs.Literal;
  assertEquals(lit.value, "42");
  assertEquals(lit.datatype.value, "http://www.w3.org/2001/XMLSchema#integer");
});

Deno.test("LibsqlStore.match - DefaultGraph round-trip", async () => {
  const db = createClient({ url: ":memory:" });
  await setupSchema(db);
  await seedQuad(db, {
    id: "h1",
    s: "urn:s",
    p: "urn:p",
    o: "o1",
    g: "",
    g_type: "DefaultGraph",
  });
  const store = new LibsqlStore(db, testBuilder);

  const results = await collectStream(
    store.match(namedNode("urn:s"), null, null, null),
  );

  assertEquals(results.length, 1);
  assertEquals(results[0].graph.termType, "DefaultGraph");
});

Deno.test(
  "LibsqlStore.match - literal object binding includes language constraints",
  async () => {
    const db = createClient({ url: ":memory:" });
    await setupSchema(db);
    await seedQuad(db, {
      id: "h1",
      s: "urn:s",
      p: "urn:p",
      o: "hola",
      o_type: "Literal",
      o_lang: "es",
    });
    await seedQuad(db, {
      id: "h2",
      s: "urn:s2",
      p: "urn:p",
      o: "hello",
      o_type: "Literal",
      o_lang: "en",
    });
    const store = new LibsqlStore(db, testBuilder);

    const results = await collectStream(
      store.match(
        namedNode("urn:s"),
        namedNode("urn:p"),
        literal("hola", "es"),
        null,
      ),
    );

    assertEquals(results.length, 1);
    assertEquals((results[0].object as rdfjs.Literal).language, "es");
  },
);

Deno.test(
  "LibsqlStore.match - explicit xsd:string datatype uses IS NULL constraint",
  async () => {
    const db = createClient({ url: ":memory:" });
    await setupSchema(db);
    await seedQuad(db, {
      id: "h1",
      s: "urn:s",
      p: "urn:p",
      o: "plain",
      o_type: "Literal",
      o_datatype: null,
    });
    await seedQuad(db, {
      id: "h2",
      s: "urn:s",
      p: "urn:p",
      o: "42",
      o_type: "Literal",
      o_datatype: "http://www.w3.org/2001/XMLSchema#integer",
    });
    const store = new LibsqlStore(db, testBuilder);

    const results = await collectStream(
      store.match(
        namedNode("urn:s"),
        namedNode("urn:p"),
        literal(
          "plain",
          namedNode("http://www.w3.org/2001/XMLSchema#string"),
        ),
        null,
      ),
    );

    assertEquals(results.length, 1);
    assertEquals(results[0].object.value, "plain");
  },
);

Deno.test("LibsqlStore.match - NamedNode object terms round-trip", async () => {
  const db = createClient({ url: ":memory:" });
  await setupSchema(db);
  await seedQuad(db, {
    id: "h1",
    s: "urn:s",
    p: "urn:p",
    o: "http://example.com/resource",
    o_type: "NamedNode",
    o_datatype: null,
    o_lang: null,
  });
  const store = new LibsqlStore(db, testBuilder);

  const results = await collectStream(
    store.match(null, null, namedNode("http://example.com/resource"), null),
  );

  assertEquals(results.length, 1);
  assertEquals(results[0].object.termType, "NamedNode");
});

Deno.test("LibsqlStore.match - BlankNode graph terms round-trip", async () => {
  const db = createClient({ url: ":memory:" });
  await setupSchema(db);
  await seedQuad(db, {
    id: "h1",
    s: "urn:s",
    p: "urn:p",
    o: "value",
    g: "genid-graph",
    g_type: "BlankNode",
  });
  const store = new LibsqlStore(db, testBuilder);

  const results = await collectStream(
    store.match(null, null, null, blankNode("genid-graph")),
  );

  assertEquals(results.length, 1);
  assertEquals(results[0].graph.termType, "BlankNode");
});

Deno.test(
  "LibsqlStore.match - propagates database errors through the result stream",
  async () => {
    const failingClient = {
      execute: () => Promise.reject(new Error("database unavailable")),
    } as unknown as Client;
    const store = new LibsqlStore(failingClient, testBuilder);

    await assertRejects(
      () => collectStream(store.match(null, null, null, null)),
      Error,
      "database unavailable",
    );
  },
);

Deno.test("LibsqlStore.match - multiple named graphs are isolated", async () => {
  const db = createClient({ url: ":memory:" });
  await setupSchema(db);
  await seedQuad(db, {
    id: "h1",
    s: "urn:s",
    p: "urn:p",
    o: "o1",
    g: "urn:g1",
    g_type: "NamedNode",
  });
  await seedQuad(db, {
    id: "h2",
    s: "urn:s",
    p: "urn:p",
    o: "o2",
    g: "urn:g2",
    g_type: "NamedNode",
  });
  const store = new LibsqlStore(db, testBuilder);

  const g1Results = await collectStream(
    store.match(null, null, null, namedNode("urn:g1")),
  );
  assertEquals(g1Results.length, 1);
  assertEquals(g1Results[0].object.value, "o1");
});

// ──────────────────────────────────────────────────
// Phase 2: mutation and commit tests
// ──────────────────────────────────────────────────

function createCommitHandler(
  db: ReturnType<typeof createClient>,
  builder: typeof testBuilder,
): (
  patch: { insertions: rdfjs.Quad[]; deletions: rdfjs.Quad[] },
) => Promise<void> {
  return async (patch) => {
    const statements: Array<{ sql: string; args: (string | null)[] }> = [];

    for (const quad of patch.deletions) {
      const id = await computeQuadId(quad);
      statements.push({
        sql: `DELETE FROM quads WHERE id = ?`,
        args: [id],
      });
    }

    for (const quad of patch.insertions) {
      const id = await computeQuadId(quad);
      const isLit = quad.object.termType === "Literal";
      const litNode = isLit ? (quad.object as rdfjs.Literal) : null;
      statements.push(
        builder.buildInsertQuad({
          quad_id: id,
          s: quad.subject.value,
          s_type: quad.subject.termType,
          p: quad.predicate.value,
          o: quad.object.value,
          o_type: quad.object.termType,
          o_datatype: litNode?.datatype?.value,
          o_lang: litNode?.language,
          g: quad.graph.value,
          g_type: quad.graph.termType,
        }),
      );
    }

    if (statements.length > 0) {
      // deno-lint-ignore no-explicit-any
      await db.batch(statements as any, "write");
    }
  };
}

async function computeQuadId(quad: rdfjs.Quad): Promise<string> {
  const { hashQuad } = await import(
    "@worlds/client"
  );
  return await hashQuad(quad);
}

Deno.test("LibsqlStore.add - buffered quad not visible before commit", async () => {
  const db = createClient({ url: ":memory:" });
  await setupSchema(db);
  const store = new LibsqlStore(db, testBuilder);

  store.add(quad(namedNode("urn:s"), namedNode("urn:p"), literal("v1")));

  // Not visible before commit
  const results = await collectStream(store.match(null, null, null, null));
  assertEquals(results.length, 0);
});

Deno.test("LibsqlStore.add - commit persists quad, match finds it", async () => {
  const db = createClient({ url: ":memory:" });
  await setupSchema(db);
  const store = new LibsqlStore(
    db,
    testBuilder,
    createCommitHandler(db, testBuilder),
  );

  const q = quad(namedNode("urn:s"), namedNode("urn:p"), literal("v1"));
  store.add(q);
  await store.commit();

  const results = await collectStream(store.match(null, null, null, null));
  assertEquals(results.length, 1);
  assertEquals(results[0].subject.value, "urn:s");
  assertEquals(results[0].object.value, "v1");
});

Deno.test("LibsqlStore.add - commit once, then add+commit again accumulates", async () => {
  const db = createClient({ url: ":memory:" });
  await setupSchema(db);
  const store = new LibsqlStore(
    db,
    testBuilder,
    createCommitHandler(db, testBuilder),
  );

  store.add(quad(namedNode("urn:s"), namedNode("urn:p"), literal("v1")));
  await store.commit();
  assertEquals(
    (await collectStream(store.match(null, null, null, null))).length,
    1,
  );

  store.add(quad(namedNode("urn:s2"), namedNode("urn:p"), literal("v2")));
  await store.commit();
  assertEquals(
    (await collectStream(store.match(null, null, null, null))).length,
    2,
  );
});

Deno.test("LibsqlStore.delete - buffered quad still visible before commit", async () => {
  const db = createClient({ url: ":memory:" });
  await setupSchema(db);
  const store = new LibsqlStore(
    db,
    testBuilder,
    createCommitHandler(db, testBuilder),
  );

  const q = quad(namedNode("urn:s"), namedNode("urn:p"), literal("v1"));
  store.add(q);
  await store.commit();

  store.delete(q);
  // Still visible before commit
  assertEquals(
    (await collectStream(store.match(null, null, null, null))).length,
    1,
  );

  // Gone after commit
  await store.commit();
  assertEquals(
    (await collectStream(store.match(null, null, null, null))).length,
    0,
  );
});

Deno.test("LibsqlStore.delete - add then delete same quad before commit is net zero", async () => {
  const db = createClient({ url: ":memory:" });
  await setupSchema(db);
  const store = new LibsqlStore(
    db,
    testBuilder,
    createCommitHandler(db, testBuilder),
  );

  const q = quad(namedNode("urn:s"), namedNode("urn:p"), literal("v1"));
  store.add(q);
  store.delete(q);
  await store.commit();

  assertEquals(
    (await collectStream(store.match(null, null, null, null))).length,
    0,
  );
});

Deno.test("LibsqlStore.removeMatches - buffers matching quads for deletion", async () => {
  const db = createClient({ url: ":memory:" });
  await setupSchema(db);
  const store = new LibsqlStore(
    db,
    testBuilder,
    createCommitHandler(db, testBuilder),
  );

  store.add(quad(namedNode("urn:s"), namedNode("urn:p"), literal("hello")));
  store.add(quad(namedNode("urn:s"), namedNode("urn:p"), literal("world")));
  store.add(quad(namedNode("urn:other"), namedNode("urn:p"), literal("stay")));
  await store.commit();
  assertEquals(
    (await collectStream(store.match(null, null, null, null))).length,
    3,
  );

  // Remove matching quads for urn:s
  await new Promise<void>((resolve, reject) => {
    const emitter = store.removeMatches(namedNode("urn:s"), null, null, null);
    emitter.on("end", resolve);
    emitter.on("error", reject);
  });

  // Still visible before commit
  assertEquals(
    (await collectStream(store.match(null, null, null, null))).length,
    3,
  );

  await store.commit();

  // Two removed, one stays
  const remaining = await collectStream(store.match(null, null, null, null));
  assertEquals(remaining.length, 1);
  assertEquals(remaining[0].subject.value, "urn:other");
});

Deno.test("LibsqlStore.clearBuffer - discards pending mutations on error", async () => {
  const db = createClient({ url: ":memory:" });
  await setupSchema(db);
  const store = new LibsqlStore(
    db,
    testBuilder,
    createCommitHandler(db, testBuilder),
  );

  store.add(quad(namedNode("urn:s"), namedNode("urn:p"), literal("v1")));
  store.delete(quad(namedNode("urn:s"), namedNode("urn:p"), literal("v2")));

  store.clearBuffer();
  await store.commit(); // should be no-op

  assertEquals(
    (await collectStream(store.match(null, null, null, null))).length,
    0,
  );
});

function createErrorQuadStream(
  message = "stream broke",
): rdfjs.Stream<rdfjs.Quad> {
  const stream = new Readable({
    read() {
      this.destroy(new Error(message));
    },
  });
  return stream as unknown as rdfjs.Stream<rdfjs.Quad>;
}

Deno.test("LibsqlStore.import - forwards stream errors to the emitter", async () => {
  const db = createClient({ url: ":memory:" });
  await setupSchema(db);
  const store = new LibsqlStore(db, testBuilder);

  await assertRejects(
    () =>
      new Promise<void>((resolve, reject) => {
        const emitter = store.import(createErrorQuadStream());
        emitter.on("end", resolve);
        emitter.on("error", reject);
      }),
    Error,
    "stream broke",
  );
});

Deno.test("LibsqlStore.remove - stream buffers quads for deletion on commit", async () => {
  const db = createClient({ url: ":memory:" });
  await setupSchema(db);
  const store = new LibsqlStore(
    db,
    testBuilder,
    createCommitHandler(db, testBuilder),
  );

  const keepQuad = quad(
    namedNode("urn:keep"),
    namedNode("urn:p"),
    literal("stay"),
  );
  const removeQuad = quad(
    namedNode("urn:remove"),
    namedNode("urn:p"),
    literal("gone"),
  );
  store.add(keepQuad);
  store.add(removeQuad);
  await store.commit();

  const stream = Readable.from([removeQuad]) as unknown as rdfjs.Stream<
    rdfjs.Quad
  >;
  await new Promise<void>((resolve, reject) => {
    const emitter = store.remove(stream);
    emitter.on("end", resolve);
    emitter.on("error", reject);
  });
  await store.commit();

  const remaining = await collectStream(store.match(null, null, null, null));
  assertEquals(remaining.length, 1);
  assertEquals(remaining[0].subject.value, "urn:keep");
});

Deno.test(
  "LibsqlStore.removeMatches - forwards match stream errors to the emitter",
  async () => {
    const failingClient = {
      execute: () => Promise.reject(new Error("match query failed")),
    } as unknown as Client;
    const store = new LibsqlStore(failingClient, testBuilder);

    await assertRejects(
      () =>
        new Promise<void>((resolve, reject) => {
          const emitter = store.removeMatches(null, null, null, null);
          emitter.on("end", resolve);
          emitter.on("error", reject);
        }),
      Error,
      "match query failed",
    );
  },
);

Deno.test("LibsqlStore.deleteGraph - accepts graph IRI strings", async () => {
  const db = createClient({ url: ":memory:" });
  await setupSchema(db);
  const store = new LibsqlStore(
    db,
    testBuilder,
    createCommitHandler(db, testBuilder),
  );

  store.add(
    quad(
      namedNode("urn:s"),
      namedNode("urn:p"),
      literal("in graph"),
      namedNode("urn:target-graph"),
    ),
  );
  store.add(
    quad(
      namedNode("urn:s"),
      namedNode("urn:p"),
      literal("outside graph"),
      namedNode("urn:other-graph"),
    ),
  );
  await store.commit();

  await new Promise<void>((resolve, reject) => {
    const emitter = store.deleteGraph("urn:target-graph");
    emitter.on("end", resolve);
    emitter.on("error", reject);
  });
  await store.commit();

  const remaining = await collectStream(store.match(null, null, null, null));
  assertEquals(remaining.length, 1);
  assertEquals(remaining[0].graph.value, "urn:other-graph");
});

Deno.test("LibsqlStore.commit - is a no-op when both buffers are empty", async () => {
  const db = createClient({ url: ":memory:" });
  await setupSchema(db);
  let commitHandlerCalls = 0;
  const store = new LibsqlStore(db, testBuilder, () => {
    commitHandlerCalls++;
    return Promise.resolve();
  });

  await store.commit();

  assertEquals(commitHandlerCalls, 0);
});

Deno.test("LibsqlStore.import - stream buffers all quads, commit persists them", async () => {
  const db = createClient({ url: ":memory:" });
  await setupSchema(db);
  const store = new LibsqlStore(
    db,
    testBuilder,
    createCommitHandler(db, testBuilder),
  );

  const q1 = quad(namedNode("urn:s1"), namedNode("urn:p"), literal("a"));
  const q2 = quad(namedNode("urn:s2"), namedNode("urn:p"), literal("b"));
  const stream = Readable.from([q1, q2]) as unknown as rdfjs.Stream<rdfjs.Quad>;

  await new Promise<void>((resolve, reject) => {
    const emitter = store.import(stream);
    emitter.on("end", resolve);
    emitter.on("error", reject);
  });

  await store.commit();
  assertEquals(
    (await collectStream(store.match(null, null, null, null))).length,
    2,
  );
});
