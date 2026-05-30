import { assertEquals } from "@std/assert";
import { DataFactory, Store } from "n3";
import type { QuadStoreInterface } from "./quad-store-interface.ts";
import { RdfjsQuadStore } from "@/client/adapters/rdfjs/rdfjs-quad-store.ts";
import type { ImportLifecycle } from "./import-lifecycle.ts";

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

function registerQuadStoreImportContract(
  label: string,
  createStore: () => QuadStoreInterface,
): void {
  Deno.test(`${label} - merge mode retains prior quads`, async () => {
    const store = createStore();
    await store.import({
      mode: "merge",
      source: { kind: "quads", quads: [q1] },
    });
    await store.import({
      mode: "merge",
      source: { kind: "quads", quads: [q2] },
    });

    const response = await store.export({ format: { kind: "quads" } });
    if (response.kind !== "quads") {
      throw new Error("Expected quads response");
    }
    assertEquals(response.quads.length, 2);
  });

  Deno.test(`${label} - replace mode leaves only new quads`, async () => {
    const store = createStore();
    await store.import({
      mode: "merge",
      source: { kind: "quads", quads: [q1] },
    });
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
}

registerQuadStoreImportContract(
  "RdfjsQuadStore",
  () => new RdfjsQuadStore(new Store()),
);

Deno.test("RdfjsQuadStore - importLifecycle hooks fire around import", async () => {
  const events: string[] = [];
  const lifecycle: ImportLifecycle = {
    beforeImport: () => events.push("before"),
    afterImport: () => {
      events.push("after");
      return Promise.resolve();
    },
  };
  const store = new RdfjsQuadStore({
    store: new Store(),
    importLifecycle: lifecycle,
  });

  await store.import({ source: { kind: "quads", quads: [q1] } });
  assertEquals(events, ["before", "after"]);
});
