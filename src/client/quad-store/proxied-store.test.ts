import { assertEquals } from "@std/assert";
import { DataFactory, Store } from "n3";
import { proxiedStore } from "./proxied-store.ts";
import { QueryEngine } from "@comunica/query-sparql-rdfjs-lite";
import { executeSparql } from "#/client/providers/comunica/mod.ts";

const { quad, namedNode, literal } = DataFactory;

Deno.test("Slice 1: proxiedStore proxy captures raw addQuad mutation", () => {
  const baseStore = new Store();
  const { store, drainPatches } = proxiedStore(baseStore);

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

Deno.test("Slice 1: proxiedStore proxy captures raw removeQuad mutation", () => {
  const baseStore = new Store();
  const testQuad = quad(namedNode("u:s"), namedNode("u:p"), literal("v"));
  baseStore.addQuad(testQuad);

  const { store, drainPatches } = proxiedStore(baseStore);

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

Deno.test("Slice 1: proxiedStore proxy captures removeMatches", async () => {
  const baseStore = new Store();
  const q1 = quad(namedNode("u:s1"), namedNode("u:p"), literal("v1"));
  const q2 = quad(namedNode("u:s2"), namedNode("u:p"), literal("v2"));
  baseStore.addQuad(q1);
  baseStore.addQuad(q2);

  const { store, drainPatches } = proxiedStore(baseStore);

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
  const { store, drainPatches } = proxiedStore(baseStore);
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
