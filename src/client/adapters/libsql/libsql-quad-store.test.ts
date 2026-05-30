import { assertEquals } from "@std/assert";
import { type Client, createClient } from "@libsql/client";
import { DataFactory } from "n3";
import { LibsqlQuadStore } from "./libsql-quad-store.ts";
import { LibsqlRdfjsStore } from "./libsql-rdfjs-store.ts";
import { createLibsqlPatchSyncState } from "./sync/libsql-patch-sync.ts";
import {
  setupLibsqlSchemaForTest,
  sharedTextSplitter,
  testLibsqlQueryBuilder,
} from "./libsql-test-fixtures.ts";

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

async function createLibsqlQuadStoreForTest(): Promise<{
  store: LibsqlQuadStore;
  client: Client;
}> {
  const client = createClient({ url: ":memory:" });
  await setupLibsqlSchemaForTest(client);
  const patchSync = createLibsqlPatchSyncState({
    client,
    libsqlQueryBuilder: testLibsqlQueryBuilder,
    textSplitter: sharedTextSplitter,
    searchIndexOnImport: "disabled",
  });
  const libsqlRdfjsStore = new LibsqlRdfjsStore({
    client,
    queryBuilder: testLibsqlQueryBuilder,
    commitHandler: patchSync.persistPatch,
  });
  return {
    client,
    store: new LibsqlQuadStore({
      libsqlRdfjsStore,
      importLifecycle: patchSync,
    }),
  };
}

Deno.test("LibsqlQuadStore.import - merge mode retains prior quads", async () => {
  const { store } = await createLibsqlQuadStoreForTest();

  await store.import({ mode: "merge", source: { kind: "quads", quads: [q1] } });
  await store.import({ mode: "merge", source: { kind: "quads", quads: [q2] } });

  const response = await store.export({ format: { kind: "quads" } });
  if (response.kind !== "quads") {
    throw new Error("Expected quads response");
  }
  assertEquals(response.quads.length, 2);
});

Deno.test("LibsqlQuadStore.import - replace mode leaves only new quads", async () => {
  const { store } = await createLibsqlQuadStoreForTest();

  await store.import({ mode: "merge", source: { kind: "quads", quads: [q1] } });
  await store.import({
    mode: "replace",
    source: { kind: "quads", quads: [q2] },
  });

  const response = await store.export({ format: { kind: "quads" } });
  if (response.kind !== "quads") {
    throw new Error("Expected quads response");
  }
  assertEquals(response.quads.length, 1);
  assertEquals(response.quads[0].subject.value, q2.subject.value);
});
