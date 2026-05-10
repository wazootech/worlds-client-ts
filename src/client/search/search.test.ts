import { assertEquals } from "@std/assert";
import { DataFactory, Store } from "n3";
import { executeSearch } from "./search.ts";

Deno.test("executeSearch - returns literal matching text locally", async () => {
  const store = new Store();
  store.addQuad(
    DataFactory.namedNode("http://example.com/entity1"),
    DataFactory.namedNode("http://example.com/hasDesc"),
    DataFactory.literal("Found some delicious tacos for lunch"),
  );
  store.addQuad(
    DataFactory.namedNode("http://example.com/entity2"),
    DataFactory.namedNode("http://example.com/hasDesc"),
    DataFactory.literal("Boring non-matching payload"),
  );

  const response = await executeSearch(store, {
    query: "Tacos",
  });

  assertEquals(response.results?.length, 1);
  assertEquals(
    response.results?.[0].object,
    "Found some delicious tacos for lunch",
  );
});
