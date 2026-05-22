import { assertEquals } from "@std/assert";
import { DataFactory, Store } from "n3";
import { proxyStore } from "./proxy-store.ts";
import { QueryEngine } from "@comunica/query-sparql-rdfjs-lite";
import { executeSparql } from "@/client/adapters/comunica/mod.ts";

const { quad, namedNode, literal } = DataFactory;

Deno.test("Slice 1: proxyStore proxy captures raw addQuad mutation", () => {
  const baseStore = new Store();
  const { store, drainPatches } = proxyStore(baseStore);

  const testQuad = quad(
    namedNode("urn:sub"),
    namedNode("urn:pred"),
    literal("Capturable value"),
  );

  // Perform native memory store write through Proxy
  store.addQuad(testQuad);

  // Verify the hook automatically caught the action and loaded our queue!
  const pending = drainPatches();
  assertEquals(
    pending.length,
    1,
    "Expected exactly one patch transaction recorded",
  );
  assertEquals(pending[0].insertions.length, 1);
  assertEquals(pending[0].insertions[0].object.value, "Capturable value");

  // Ensure actual data made it to physical N3 storage too
  assertEquals(
    baseStore.size,
    1,
    "Proxy failed to delegate to inner store memory",
  );
});

Deno.test("Slice 1: proxyStore proxy captures raw removeQuad mutation", () => {
  const baseStore = new Store();
  const testQuad = quad(namedNode("u:s"), namedNode("u:p"), literal("v"));
  baseStore.addQuad(testQuad);

  const { store, drainPatches } = proxyStore(baseStore);

  // Perform remove through proxy
  store.removeQuad(testQuad);

  const pending = drainPatches();
  assertEquals(pending.length, 1);
  assertEquals(
    pending[0].deletions.length,
    1,
    "Expected deletion to be tracked in buffer",
  );
});

Deno.test("Slice 1: proxyStore proxy captures removeMatches", async () => {
  const baseStore = new Store();
  const q1 = quad(namedNode("u:s1"), namedNode("u:p"), literal("v1"));
  const q2 = quad(namedNode("u:s2"), namedNode("u:p"), literal("v2"));
  baseStore.addQuad(q1);
  baseStore.addQuad(q2);

  const { store, drainPatches } = proxyStore(baseStore);

  // removeMatches returns a stream — consume it to ensure queue is populated
  const removalStream = store.removeMatches(null, namedNode("u:p"), null, null);
  await new Promise<void>((resolve) => {
    // deno-lint-ignore no-explicit-any
    (removalStream as any).on("end", resolve);
    // deno-lint-ignore no-explicit-any
    (removalStream as any).on("error", resolve);
  });

  const pending = drainPatches();
  assertEquals(pending.length, 1, "Expected exactly one patch");
  assertEquals(
    pending[0].deletions.length,
    2,
    "Expected both quads captured as deletions",
  );
  assertEquals(
    baseStore.size,
    0,
    "Base store should be empty after removeMatches",
  );
});

Deno.test("Slice 2: bridge automatically transparently captures implicit Comunica SPARQL updates", async () => {
  const baseStore = new Store();
  const { store, drainPatches } = proxyStore(baseStore);
  const engine = new QueryEngine();

  // Fire a live SPARQL Update into the proxied store
  const updateQuery = `
    INSERT DATA { <urn:agent> <urn:wrote> "This was automated via SPARQL!" }
  `;

  await executeSparql(engine, store, { query: updateQuery });

  // Verify the chain worked!
  // Comunica -> Proxy Hook -> Closure Array!
  const pending = drainPatches();

  // It could trigger either multiple small patches or one big one depending on Comunica internals.
  // We check that SOME insertions made it.
  const totalInsertions = pending.reduce(
    (acc, patch) => acc + patch.insertions.length,
    0,
  );

  assertEquals(
    totalInsertions > 0,
    true,
    "Comunica updates failed to activate the Proxy hook!",
  );

  // Also explicitly check memory presence
  assertEquals(baseStore.size, 1, "Memory failed to write");
});

Deno.test("proxyStore - add alias captures insertions like addQuad", () => {
  const baseStore = new Store();
  const { store, drainPatches } = proxyStore(baseStore);
  const testQuad = quad(
    namedNode("urn:sub"),
    namedNode("urn:pred"),
    literal("via add"),
  );

  store.add(testQuad);

  const pending = drainPatches();
  assertEquals(pending.length, 1);
  assertEquals(pending[0].insertions[0].object.value, "via add");
  assertEquals(baseStore.size, 1);
});

Deno.test(
  'proxyStore - proxied store exposes removeMatches for Comunica "has" checks',
  () => {
    const baseStore = new Store();
    const { store } = proxyStore(baseStore);

    assertEquals("removeMatches" in store, true);
  },
);

Deno.test(
  "proxyStore - duplicate addQuad does not enqueue redundant patches",
  () => {
    const baseStore = new Store();
    const { store, drainPatches } = proxyStore(baseStore);
    const testQuad = quad(
      namedNode("urn:sub"),
      namedNode("urn:pred"),
      literal("once"),
    );

    store.addQuad(testQuad);
    drainPatches();
    store.addQuad(testQuad);

    assertEquals(drainPatches().length, 0);
    assertEquals(baseStore.size, 1);
  },
);

Deno.test("proxyStore - removeQuad on absent quad emits no patch", () => {
  const baseStore = new Store();
  const testQuad = quad(namedNode("u:s"), namedNode("u:p"), literal("v"));
  const { store, drainPatches } = proxyStore(baseStore);

  store.removeQuad(testQuad);

  assertEquals(drainPatches().length, 0);
});

Deno.test(
  "proxyStore - addQuads records only novel quads in the patch",
  () => {
    const baseStore = new Store();
    const existingQuad = quad(
      namedNode("u:s1"),
      namedNode("u:p"),
      literal("existing"),
    );
    const novelQuad = quad(
      namedNode("u:s2"),
      namedNode("u:p"),
      literal("novel"),
    );
    baseStore.addQuad(existingQuad);

    const { store, drainPatches } = proxyStore(baseStore);
    store.addQuads([existingQuad, novelQuad]);

    const pending = drainPatches();
    assertEquals(pending.length, 1);
    assertEquals(pending[0].insertions.length, 1);
    assertEquals(pending[0].insertions[0].object.value, "novel");
    assertEquals(baseStore.size, 2);
  },
);

Deno.test(
  "proxyStore - removeQuads records only quads that existed in the store",
  () => {
    const baseStore = new Store();
    const presentQuad = quad(
      namedNode("u:s1"),
      namedNode("u:p"),
      literal("present"),
    );
    const absentQuad = quad(
      namedNode("u:s2"),
      namedNode("u:p"),
      literal("absent"),
    );
    baseStore.addQuad(presentQuad);

    const { store, drainPatches } = proxyStore(baseStore);
    store.removeQuads([presentQuad, absentQuad]);

    const pending = drainPatches();
    assertEquals(pending.length, 1);
    assertEquals(pending[0].deletions.length, 1);
    assertEquals(pending[0].deletions[0].object.value, "present");
    assertEquals(baseStore.size, 0);
  },
);

Deno.test("proxyStore - drainPatches clears the pending queue", () => {
  const baseStore = new Store();
  const { store, drainPatches } = proxyStore(baseStore);
  const testQuad = quad(namedNode("u:s"), namedNode("u:p"), literal("v"));

  store.addQuad(testQuad);
  assertEquals(drainPatches().length, 1);
  assertEquals(drainPatches().length, 0);
});

Deno.test(
  "proxyStore - import stream captures novel quads from an N3 match stream",
  async () => {
    const baseStore = new Store();
    const { store, drainPatches } = proxyStore(baseStore);

    const donorStore = new Store();
    const firstQuad = quad(namedNode("u:s1"), namedNode("u:p"), literal("a"));
    const secondQuad = quad(namedNode("u:s2"), namedNode("u:p"), literal("b"));
    donorStore.addQuad(firstQuad);
    donorStore.addQuad(secondQuad);

    const stream = donorStore.match();
    await new Promise<void>((resolve, reject) => {
      store.import(stream);
      // deno-lint-ignore no-explicit-any
      (stream as any).on("end", resolve);
      // deno-lint-ignore no-explicit-any
      (stream as any).on("error", reject);
    });

    const pending = drainPatches();
    const totalInsertions = pending.reduce(
      (accumulator, patch) => accumulator + patch.insertions.length,
      0,
    );

    assertEquals(totalInsertions, 2);
    assertEquals(baseStore.size, 2);
  },
);
