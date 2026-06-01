import { assertEquals } from "@std/assert";
import { DataFactory, Store } from "n3";
import { createRdfjsStoreCommitHandler } from "./apply-rdfjs-patch-to-store.ts";
import { commitBufferedPatch } from "./commit-buffered-patch.ts";
import { RdfjsPatchBuffer } from "./rdfjs-patch-buffer.ts";

const { namedNode, literal, quad } = DataFactory;

Deno.test("commitBufferedPatch - SPARQL commit skips import lifecycle", async () => {
  const events: string[] = [];
  const store = new Store();
  const patchBuffer = new RdfjsPatchBuffer();
  const testQuad = quad(
    namedNode("http://example.org/s"),
    namedNode("http://example.org/p"),
    literal("v"),
  );
  patchBuffer.addQuad(testQuad);

  await commitBufferedPatch(patchBuffer, {
    commitHandler: createRdfjsStoreCommitHandler(store),
    importLifecycle: {
      beforeImport: () => events.push("before"),
      afterImport: () => {
        events.push("after");
        return Promise.resolve();
      },
    },
  });

  assertEquals(events, []);
  assertEquals(store.size, 1);
});

Deno.test("commitBufferedPatch - import commit runs lifecycle", async () => {
  const events: string[] = [];
  const store = new Store();
  const patchBuffer = new RdfjsPatchBuffer();
  const testQuad = quad(
    namedNode("http://example.org/s"),
    namedNode("http://example.org/p"),
    literal("v"),
  );
  patchBuffer.addQuad(testQuad);

  await commitBufferedPatch(patchBuffer, {
    commitHandler: createRdfjsStoreCommitHandler(store),
    context: { importMode: "merge" },
    importLifecycle: {
      beforeImport: () => events.push("before"),
      afterImport: () => {
        events.push("after");
        return Promise.resolve();
      },
    },
  });

  assertEquals(events, ["before", "after"]);
  assertEquals(store.size, 1);
});
