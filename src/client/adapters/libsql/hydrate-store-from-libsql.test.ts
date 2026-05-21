import { assertEquals } from "@std/assert";
import { createClient } from "@libsql/client";
import { Store } from "n3";
import { defaultLibsqlQueryBuilder } from "./libsql-query-builder.ts";
import { hydrateStoreFromLibsql } from "./hydrate-store-from-libsql.ts";

Deno.test("Slice 4: Hydrator - recovers whole graph from stored serialized quad lines", async () => {
  const client = createClient({ url: ":memory:" });
  await client.execute(defaultLibsqlQueryBuilder.buildLibsqlQuadsTable());

  // Manually seed the raw table with granular component columns mimicking sync engine
  await client.execute({
    sql: `INSERT INTO quads (id, s, s_type, p, o, o_type, g, g_type) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      "hash1",
      "urn:e1",
      "NamedNode",
      "urn:p",
      "val1",
      "Literal",
      "",
      "DefaultGraph",
    ],
  });

  await client.execute({
    sql: `INSERT INTO quads (id, s, s_type, p, o, o_type, g, g_type) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      "hash2",
      "urn:e2",
      "NamedNode",
      "urn:p",
      "val2",
      "Literal",
      "",
      "DefaultGraph",
    ],
  });

  // Run the naive hydrator
  const targetStore = new Store();
  const count = await hydrateStoreFromLibsql(client, targetStore);

  // Assert exact counts match expectations
  assertEquals(
    count,
    2,
    "Returned count does not match expected hydration quantity",
  );
  assertEquals(
    targetStore.size,
    2,
    "Physical N3 storage missed incoming loaded entities",
  );
});

Deno.test("Hydrator - faithfully reconstructs advanced terms (BlankNodes, Datatypes, Languages)", async () => {
  const client = createClient({ url: ":memory:" });
  await client.execute(defaultLibsqlQueryBuilder.buildLibsqlQuadsTable());

  await client.execute({
    sql:
      `INSERT INTO quads (id, s, s_type, p, o, o_type, o_datatype, o_lang, g, g_type) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      "bnode-quad",
      "genid-1",
      "BlankNode",
      "urn:p",
      "genid-2",
      "BlankNode",
      null,
      null,
      "genid-graph",
      "BlankNode",
    ],
  });

  await client.execute({
    sql:
      `INSERT INTO quads (id, s, s_type, p, o, o_type, o_datatype, o_lang, g, g_type) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      "typed-quad",
      "urn:s",
      "NamedNode",
      "urn:p",
      "123",
      "Literal",
      "http://www.w3.org/2001/XMLSchema#integer",
      null,
      "",
      "DefaultGraph",
    ],
  });

  await client.execute({
    sql:
      `INSERT INTO quads (id, s, s_type, p, o, o_type, o_datatype, o_lang, g, g_type) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      "lang-quad",
      "urn:s",
      "NamedNode",
      "urn:p",
      "Hola",
      "Literal",
      null,
      "es",
      "",
      "DefaultGraph",
    ],
  });

  const targetStore = new Store();
  await hydrateStoreFromLibsql(client, targetStore);

  // Validate exact deserialization mapping
  const quads = targetStore.getQuads(null, null, null, null);
  assertEquals(quads.length, 3);

  const bnodeQuad = quads.find((q) => q.subject.termType === "BlankNode");
  assertEquals(bnodeQuad?.subject.value, "genid-1");
  assertEquals(bnodeQuad?.object.termType, "BlankNode");
  assertEquals(bnodeQuad?.graph.termType, "BlankNode");

  const intLiteral = quads.find(
    (q) =>
      q.object.termType === "Literal" &&
      q.object.datatype.value.includes("integer"),
  );
  assertEquals(intLiteral?.object.value, "123");

  const esLiteral = quads.find(
    (q) => q.object.termType === "Literal" && q.object.language === "es",
  );
  assertEquals(esLiteral?.object.value, "Hola");
});

Deno.test("hydrateStoreFromLibsql - returns zero when the quads table is empty", async () => {
  const client = createClient({ url: ":memory:" });
  await client.execute(defaultLibsqlQueryBuilder.buildLibsqlQuadsTable());

  const targetStore = new Store();
  const count = await hydrateStoreFromLibsql(client, targetStore);

  assertEquals(count, 0);
  assertEquals(targetStore.size, 0);
});

Deno.test(
  "hydrateStoreFromLibsql - applies QuadFilter include constraints during hydration",
  async () => {
    const client = createClient({ url: ":memory:" });
    await client.execute(defaultLibsqlQueryBuilder.buildLibsqlQuadsTable());

    await client.execute({
      sql:
        `INSERT INTO quads (id, s, s_type, p, o, o_type, g, g_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        "h1",
        "urn:included",
        "NamedNode",
        "urn:p",
        "included value",
        "Literal",
        "",
        "DefaultGraph",
      ],
    });
    await client.execute({
      sql:
        `INSERT INTO quads (id, s, s_type, p, o, o_type, g, g_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        "h2",
        "urn:excluded",
        "NamedNode",
        "urn:p",
        "excluded value",
        "Literal",
        "",
        "DefaultGraph",
      ],
    });

    const targetStore = new Store();
    const count = await hydrateStoreFromLibsql(client, targetStore, {
      include: { subjects: ["urn:included"] },
    });

    assertEquals(count, 1);
    assertEquals(targetStore.size, 1);
    assertEquals(
      targetStore.getQuads(null, null, null, null)[0].subject.value,
      "urn:included",
    );
  },
);

Deno.test(
  "hydrateStoreFromLibsql - hydrates NamedNode object terms from stored rows",
  async () => {
    const client = createClient({ url: ":memory:" });
    await client.execute(defaultLibsqlQueryBuilder.buildLibsqlQuadsTable());

    await client.execute({
      sql:
        `INSERT INTO quads (id, s, s_type, p, o, o_type, o_datatype, o_lang, g, g_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        "obj-node",
        "urn:s",
        "NamedNode",
        "urn:p",
        "http://example.com/object",
        "NamedNode",
        null,
        null,
        "",
        "DefaultGraph",
      ],
    });

    const targetStore = new Store();
    await hydrateStoreFromLibsql(client, targetStore);

    const hydratedQuad = targetStore.getQuads(null, null, null, null)[0];
    assertEquals(hydratedQuad.object.termType, "NamedNode");
    assertEquals(hydratedQuad.object.value, "http://example.com/object");
  },
);

Deno.test(
  "hydrateStoreFromLibsql - skips corrupt rows without aborting hydration",
  async () => {
    const client = {
      execute: async () => ({
        columns: [],
        rows: [
          {
            s: "urn:good",
            s_type: "NamedNode",
            p: "urn:p",
            o: "ok",
            o_type: "Literal",
            o_datatype: null,
            o_lang: null,
            g: "",
            g_type: "DefaultGraph",
          },
          {
            s: "urn:bad",
            s_type: "NamedNode",
            get p(): string {
              throw new Error("corrupt predicate column");
            },
            o: "bad",
            o_type: "Literal",
            o_datatype: null,
            o_lang: null,
            g: "",
            g_type: "DefaultGraph",
          },
        ],
      }),
    } as unknown as ReturnType<typeof createClient>;

    const targetStore = new Store();
    const count = await hydrateStoreFromLibsql(client, targetStore);

    assertEquals(count, 1);
    assertEquals(targetStore.size, 1);
    assertEquals(
      targetStore.getQuads(null, null, null, null)[0].subject.value,
      "urn:good",
    );
  },
);
