import { assertEquals, assertRejects } from "@std/assert";
import type { Quad } from "n3";
import { DataFactory, Parser, Store } from "n3";
import { canonize } from "rdf-canonize";
import { encodeBase64Url } from "@std/encoding/base64url";
import { QueryEngine } from "@comunica/query-sparql-rdfjs-lite";
import {
  type ComunicaBinding,
  type ComunicaEventStream,
  type ComunicaQueryEngine,
  ComunicaSparqlEngine,
  executeSparql,
} from "./comunica-sparql-engine.ts";

const queryEngine = new QueryEngine();

Deno.test("Comunica QueryEngine can query an n3 Store (RDFJS)", async () => {
  const store = new Store();
  store.addQuad(
    DataFactory.namedNode("https://example.com/s"),
    DataFactory.namedNode("https://example.com/p"),
    DataFactory.namedNode("https://example.com/o1"),
  );
  store.addQuad(
    DataFactory.namedNode("https://example.com/s"),
    DataFactory.namedNode("https://example.com/p"),
    DataFactory.namedNode("https://example.com/o2"),
  );

  const response = await executeSparql(queryEngine, store, {
    query:
      "SELECT ?o WHERE { <https://example.com/s> <https://example.com/p> ?o } ORDER BY ?o",
  });

  if (response.kind !== "select") {
    throw new Error("Expected select response kind");
  }

  const rows = response.data.results.bindings.map((b) => b.o?.value);

  assertEquals(rows, [
    "https://example.com/o1",
    "https://example.com/o2",
  ]);
});

Deno.test("Same SPARQL query works on bnodes vs processed (canonicalized + subject-skolemized) dataset", async (t) => {
  const ex = "https://example.com/";
  const pName = DataFactory.namedNode(`${ex}name`);
  const pKnows = DataFactory.namedNode(`${ex}knows`);

  const a = DataFactory.blankNode("a");
  const c = DataFactory.blankNode("c");
  const charlie = DataFactory.namedNode(`${ex}charlie`);
  const bob = DataFactory.namedNode(`${ex}bob`);

  const quads: Quad[] = [
    DataFactory.quad(a, pName, DataFactory.literal("Alice")),
    DataFactory.quad(c, pName, DataFactory.literal("Charlie")),
    DataFactory.quad(bob, pName, DataFactory.literal("Bob")),
    DataFactory.quad(charlie, pName, DataFactory.literal("Charlie")),
    DataFactory.quad(a, pKnows, bob),
    DataFactory.quad(c, pKnows, bob),
  ];

  const query = [
    "PREFIX ex: <https://example.com/>",
    "SELECT ?kind ?value WHERE {",
    "  {",
    "    ?s ex:name ?value .",
    '    BIND("name" AS ?kind)',
    "  } UNION {",
    "    ?s ex:knows ?value .",
    '    BIND("knows" AS ?kind)',
    "  }",
    "} ORDER BY ?kind ?value",
  ].join("\n");

  let bnodeRows: Array<{ kind?: string; value?: string }> = [];

  await t.step("query raw dataset with blank nodes", async () => {
    const original = new Store(quads);
    const response = await executeSparql(queryEngine, original, { query });
    if (response.kind !== "select") throw new Error("Expected select");

    bnodeRows = response.data.results.bindings.map((b) => ({
      kind: b.kind?.value as string,
      value: b.value?.value as string,
    }));
    assertEquals(bnodeRows.length > 0, true);
  });

  await t.step(
    "process dataset (RDFC-1.0 canonicalization + subject skolemization) and rerun same query",
    async () => {
      // @ts-ignore - rdf-canonize takes quads array
      const canonicalNQuads = await canonize(quads, {
        algorithm: "RDFC-1.0",
        format: "application/n-quads",
      });

      const canonicalStatements = canonicalNQuads
        .split("\n")
        .filter((l: string) => l.trim().length > 0)
        .map((l: string) => `${l}\n`);

      const parser = new Parser({ format: "application/n-quads" });
      const processed = new Store();

      for (const statement of canonicalStatements) {
        const [q] = parser.parse(statement) as Quad[];
        if (!q) continue;

        // Subject skolemization
        const subject = q.subject.termType === "BlankNode"
          ? DataFactory.namedNode(
            `urn:worlds:quad:${
              encodeBase64Url(new TextEncoder().encode(statement))
            }`,
          )
          : q.subject;

        processed.addQuad(
          DataFactory.quad(subject, q.predicate, q.object, q.graph),
        );
      }

      const response = await executeSparql(queryEngine, processed, { query });
      if (response.kind !== "select") throw new Error("Expected select");

      const processedRows = response.data.results.bindings.map((b) => ({
        kind: b.kind?.value as string,
        value: b.value?.value as string,
      }));

      assertEquals(processedRows, bnodeRows);
    },
  );
});

Deno.test("executeSparql - ASK returns boolean results", async () => {
  const store = new Store();
  store.addQuad(
    DataFactory.namedNode("https://example.com/s"),
    DataFactory.namedNode("https://example.com/p"),
    DataFactory.namedNode("https://example.com/o"),
  );

  const response = await executeSparql(queryEngine, store, {
    query:
      "ASK WHERE { <https://example.com/s> <https://example.com/p> <https://example.com/o> }",
  });

  if (response.kind !== "ask") {
    throw new Error("Expected ask response kind");
  }
  assertEquals(response.data.boolean, true);
});

Deno.test(
  "executeSparql - maps literal language tags into SparqlValue xml:lang",
  async () => {
    const store = new Store();

    await executeSparql(queryEngine, store, {
      query:
        `INSERT DATA { <http://example.com/s> <http://example.com/p> "hello"@en }`,
    });

    const response = await executeSparql(queryEngine, store, {
      query:
        "SELECT ?text WHERE { <http://example.com/s> <http://example.com/p> ?text }",
    });

    if (response.kind !== "select") {
      throw new Error("Expected select response kind");
    }

    const binding = response.data.results.bindings[0];
    const textValue = binding.text;
    if (textValue?.type !== "literal") {
      throw new Error("Expected literal SparqlValue");
    }
    assertEquals(textValue.value, "hello");
    assertEquals(textValue["xml:lang"], "en");
  },
);

Deno.test("executeSparql - UPDATE returns void and mutates the store", async () => {
  const store = new Store();

  const response = await executeSparql(queryEngine, store, {
    query: `INSERT DATA { <urn:test> <urn:label> "written" . }`,
  });

  assertEquals(response.kind, "void");
  assertEquals(store.size, 1);
});

Deno.test(
  "ComunicaSparqlEngine - onVoid runs after a successful UPDATE",
  async () => {
    const store = new Store();
    let voidInvoked = false;

    const sparqlEngine = new ComunicaSparqlEngine({
      queryEngine,
      store,
      onVoid: async () => {
        voidInvoked = true;
      },
    });

    const response = await sparqlEngine.execute({
      query: `INSERT DATA { <urn:onvoid> <urn:flag> "set" . }`,
    });

    assertEquals(response.kind, "void");
    assertEquals(voidInvoked, true);
  },
);

Deno.test("executeSparql - rejects when the query times out", async () => {
  const store = new Store();

  await assertRejects(
    () =>
      executeSparql(createTimeoutEngine(), store, {
        query: "SELECT ?s WHERE { ?s ?p ?o }",
        timeoutMs: 1,
      }),
    Error,
    "SPARQL query timed out",
  );
});

Deno.test(
  "executeSparql - rejects unsupported Comunica result types",
  async () => {
    const store = new Store();

    await assertRejects(
      () =>
        executeSparql(createUnsupportedResultEngine(), store, {
          query: "CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }",
        }),
      Error,
      "not supported currently",
    );
  },
);

Deno.test(
  "executeSparql - rejects bindings results without metadata",
  async () => {
    const store = new Store();

    await assertRejects(
      () =>
        executeSparql(createBindingsWithoutMetadataEngine(), store, {
          query: "SELECT ?s WHERE { ?s ?p ?o }",
        }),
      Error,
      "missing metadata",
    );
  },
);

Deno.test(
  "executeSparql - rejects when the bindings stream emits an error",
  async () => {
    const store = new Store();

    await assertRejects(
      () =>
        executeSparql(createBindingsErrorStreamEngine(), store, {
          query: "SELECT ?s WHERE { ?s ?p ?o }",
        }),
      Error,
      "stream failed",
    );
  },
);

Deno.test(
  "executeSparql - rejects non-boolean payloads for ASK results",
  async () => {
    const store = new Store();

    await assertRejects(
      () =>
        executeSparql(createNonBooleanAskEngine(), store, {
          query: "ASK WHERE { ?s ?p ?o }",
        }),
      Error,
      "non-boolean payload",
    );
  },
);

function createImmediateEndStream<T>(): ComunicaEventStream<T> {
  return {
    on(event: string, listener: (...args: unknown[]) => void) {
      if (event === "end") {
        queueMicrotask(() => listener());
      }
      return this;
    },
  } as ComunicaEventStream<T>;
}

function createErrorBindingsStream(): ComunicaEventStream<ComunicaBinding> {
  return {
    on(event: string, listener: (...args: unknown[]) => void) {
      if (event === "error") {
        queueMicrotask(() => listener(new Error("stream failed")));
      }
      return this;
    },
  } as ComunicaEventStream<ComunicaBinding>;
}

function createTimeoutEngine(): ComunicaQueryEngine {
  return {
    query: () => new Promise(() => {}),
  };
}

function createUnsupportedResultEngine(): ComunicaQueryEngine {
  return {
    query: async () => ({
      resultType: "quads",
      execute: async () => [],
    }),
  };
}

function createBindingsWithoutMetadataEngine(): ComunicaQueryEngine {
  return {
    query: async () => ({
      resultType: "bindings",
      execute: async () => createImmediateEndStream<ComunicaBinding>(),
    }),
  };
}

function createBindingsErrorStreamEngine(): ComunicaQueryEngine {
  return {
    query: async () => ({
      resultType: "bindings",
      metadata: async () => ({
        variables: [DataFactory.variable("s")],
      }),
      execute: async () => createErrorBindingsStream(),
    }),
  };
}

function createNonBooleanAskEngine(): ComunicaQueryEngine {
  return {
    query: async () => ({
      resultType: "boolean",
      execute: async () => "not-a-boolean",
    }),
  };
}
