import { assertEquals } from "@std/assert";
import { DataFactory, Store } from "n3";
import { createIndexedStore } from "./indexed-store.ts";
import { QueryEngine } from "@comunica/query-sparql-rdfjs-lite";
import { executeSparql } from "../sparql-engine/sparql-engine.ts";

const { quad, namedNode, literal } = DataFactory;

Deno.test("Slice 1: createIndexedStore proxy captures raw addQuad mutation", async () => {
  const baseStore = new Store();
  const { store, queue } = createIndexedStore(baseStore);

  const testQuad = quad(
    namedNode("urn:sub"),
    namedNode("urn:pred"),
    literal("Capturable value"),
  );

  // Perform native memory store write through Proxy
  store.addQuad(testQuad);

  // Verify the hook automatically caught the action and loaded our queue!
  const pending = queue.flush();
  assertEquals(pending.length, 1, "Expected exactly one patch transaction recorded");
  assertEquals(pending[0].insertions.length, 1);
  assertEquals(pending[0].insertions[0].object.value, "Capturable value");
  
  // Ensure actual data made it to physical N3 storage too
  assertEquals(baseStore.size, 1, "Proxy failed to delegate to inner store memory");
});

Deno.test("Slice 1: createIndexedStore proxy captures raw removeQuad mutation", async () => {
  const baseStore = new Store();
  const testQuad = quad(namedNode("u:s"), namedNode("u:p"), literal("v"));
  baseStore.addQuad(testQuad);

  const { store, queue } = createIndexedStore(baseStore);
  
  // Perform remove through proxy
  store.removeQuad(testQuad);
  
  const pending = queue.flush();
  assertEquals(pending.length, 1);
  assertEquals(pending[0].deletions.length, 1, "Expected deletion to be tracked in buffer");
});

Deno.test("Slice 2: bridge automatically transparently captures implicit Comunica SPARQL updates", async () => {
  const baseStore = new Store();
  const { store, queue } = createIndexedStore(baseStore);
  const engine = new QueryEngine();

  // Fire a live SPARQL Update into the proxied store
  const updateQuery = `
    INSERT DATA { <urn:agent> <urn:wrote> "This was automated via SPARQL!" }
  `;

  await executeSparql(engine, store, { query: updateQuery });

  // Verify the chain worked!
  // Comunica -> Proxy Hook -> PatchQueue!
  const pending = queue.flush();
  
  // It could trigger either multiple small patches or one big one depending on Comunica internals.
  // We check that SOME insertions made it.
  const totalInsertions = pending.reduce((acc, patch) => acc + patch.insertions.length, 0);
  
  assertEquals(totalInsertions > 0, true, "Comunica updates failed to activate the Proxy hook!");
  
  // Also explicitly check memory presence
  assertEquals(baseStore.size, 1, "Memory failed to write");
});
