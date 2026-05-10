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

Deno.test("executeSearch - inclusion filters strictly limit results to allowed subjects", async () => {
  const store = new Store();
  const targetSubject = "http://example.com/target";
  store.addQuad(
    DataFactory.namedNode(targetSubject),
    DataFactory.namedNode("http://example.com/desc"),
    DataFactory.literal("Match me!"),
  );
  store.addQuad(
    DataFactory.namedNode("http://example.com/wrong"),
    DataFactory.namedNode("http://example.com/desc"),
    DataFactory.literal("Match me!"),
  );

  const response = await executeSearch(store, {
    query: "match",
    include: { subjects: [targetSubject] },
  });

  assertEquals(response.results?.length, 1);
  assertEquals(response.results?.[0].subject, targetSubject);
});

Deno.test("executeSearch - exclusion filters correctly strip matching predicates", async () => {
  const store = new Store();
  const excludePred = "http://example.com/hidden";
  store.addQuad(
    DataFactory.namedNode("http://example.com/subject"),
    DataFactory.namedNode(excludePred),
    DataFactory.literal("Secret text query"),
  );

  const response = await executeSearch(store, {
    query: "secret",
    exclude: { predicates: [excludePred] },
  });

  assertEquals(
    response.results?.length,
    0,
    "Excluded predicate hit should have been filtered out",
  );
});
