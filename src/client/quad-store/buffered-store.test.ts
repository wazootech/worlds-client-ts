import { assertEquals, assertExists } from "@std/assert";
import { DataFactory, Store } from "n3";
import { RdfjsQuadStore } from "./quad-store.ts";
import { BufferedQuadStore } from "./buffered-store.ts";
import type { Patch } from "./patch.ts";

const { quad, namedNode, literal } = DataFactory;
const q1 = quad(namedNode("ex:s"), namedNode("ex:p"), literal("val1"));
const q2 = quad(namedNode("ex:s"), namedNode("ex:p"), literal("val2"));

Deno.test("BufferedQuadStore - buffers and flushes on single import", async () => {
  const inner = new RdfjsQuadStore(new Store());
  let count = 0;
  let lastPatch: any = null;
  
  const wrapper = new BufferedQuadStore(inner, [
    async (p) => {
      count++;
      lastPatch = p;
    }
  ]);

  // Triggers one implicit flush at completion
  await wrapper.import({
    source: { kind: "quads", quads: [q1] }
  });

  assertEquals(count, 1, "Listener should fire exactly once upon completion");
  assertExists(lastPatch);
  assertEquals(lastPatch!.insertions.length, 1);
  
  // Verify was actually stored in physical memory
  const exp = await wrapper.export({ format: { kind: "quads" } });
  if (exp.kind !== "quads") throw "bad";
  assertEquals(exp.quads.length, 1);
});

Deno.test("BufferedQuadStore - correctly tracks and emits replace-mode deletions", async () => {
  const backingStore = new Store();
  backingStore.add(q1); // Pre-seed with data
  const inner = new RdfjsQuadStore(backingStore);
  
  let lastPatch: any = null;
  const wrapper = new BufferedQuadStore(inner, [
    async (p) => { lastPatch = p; }
  ]);

  await wrapper.import({
    mode: "replace",
    source: { kind: "quads", quads: [q2] }
  });

  assertExists(lastPatch);
  assertEquals(lastPatch!.deletions.length, 1, "Should accurately backtrace replaced quad");
  assertEquals(lastPatch!.insertions.length, 1, "Should receive incoming quad");
  assertEquals(lastPatch!.deletions[0].object.value, "val1");
  assertEquals(lastPatch!.insertions[0].object.value, "val2");
});

Deno.test("BufferedQuadStore - seamlessly resolves serializations internally", async () => {
  const inner = new RdfjsQuadStore(new Store());
  let resolvedInsertions = 0;
  const wrapper = new BufferedQuadStore(inner, [
    async (p) => { resolvedInsertions = p.insertions.length; }
  ]);

  const turtleData = "<urn:alice> <urn:knows> <urn:bob> .";
  await wrapper.import({
    source: { kind: "serialized", data: turtleData, contentType: "text/turtle" }
  });

  assertEquals(resolvedInsertions, 1, "Should have intercepted string data and extracted count accurately");
});
