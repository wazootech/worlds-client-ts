import { assertEquals } from "@std/assert";
import { DataFactory, Store } from "n3";
import { applyExport } from "./export.ts";

const { namedNode, quad, literal } = DataFactory;

const q1 = quad(namedNode("http://a"), namedNode("http://b"), literal("c"));

Deno.test("applyExport - returns all store quads directly when kind is 'quads'", async () => {
  const store = new Store();
  store.add(q1);

  const response = await applyExport(store, {
    format: { kind: "quads" },
  });

  if (response.kind !== "quads") {
    throw new Error("Expected response of kind 'quads'");
  }

  assertEquals(response.quads.length, 1);
  assertEquals(response.quads[0].object.value, "c");
});

Deno.test("applyExport - returns serialized dump when kind is 'serialized'", async () => {
  const store = new Store();
  store.add(q1);

  const response = await applyExport(store, {
    format: { kind: "serialized", contentType: "text/turtle" },
  });

  if (response.kind !== "serialized") {
    throw new Error("Expected response of kind 'serialized'");
  }

  assertEquals(response.contentType, "text/turtle");
  // Expecting the Turtle serialization of our test quad
  assertEquals(response.data.includes('<http://a> <http://b> "c"'), true);
});
