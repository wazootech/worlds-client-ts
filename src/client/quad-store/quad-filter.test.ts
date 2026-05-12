import { assertEquals } from "@std/assert";
import { DataFactory } from "n3";
import { filterQuads } from "./quad-filter.ts";

const { namedNode, quad, defaultGraph } = DataFactory;

Deno.test("QuadFilter - compiles empty filter to open match", () => {
  const matcher = filterQuads();
  const sample = quad(
    namedNode("http://s"),
    namedNode("http://p"),
    namedNode("http://o"),
    defaultGraph(),
  );

  assertEquals(matcher(sample), true);
});

Deno.test("QuadFilter - restricts matching by positive (include) scope", () => {
  const matcher = filterQuads({
    include: {
      subjects: ["http://s1", "http://s2"],
    },
  });

  const pass = quad(
    namedNode("http://s2"),
    namedNode("http://p"),
    namedNode("http://o"),
    defaultGraph(),
  );

  const fail = quad(
    namedNode("http://s3"),
    namedNode("http://p"),
    namedNode("http://o"),
    defaultGraph(),
  );

  assertEquals(matcher(pass), true);
  assertEquals(matcher(fail), false);
});

Deno.test("QuadFilter - restricts matching by negative (exclude) scope", () => {
  const matcher = filterQuads({
    exclude: {
      graphs: ["http://g1"],
    },
  });

  const pass = quad(
    namedNode("http://s"),
    namedNode("http://p"),
    namedNode("http://o"),
    namedNode("http://g2"),
  );

  const fail = quad(
    namedNode("http://s"),
    namedNode("http://p"),
    namedNode("http://o"),
    namedNode("http://g1"),
  );

  assertEquals(matcher(pass), true);
  assertEquals(matcher(fail), false);
});

Deno.test("QuadFilter - intersects multiple combined inclusion/exclusion criteria", () => {
  const matcher = filterQuads({
    include: {
      subjects: ["http://s"],
    },
    exclude: {
      predicates: ["http://p-hidden"],
    },
  });

  const pass = quad(
    namedNode("http://s"),
    namedNode("http://p-visible"),
    namedNode("http://o"),
    defaultGraph(),
  );

  const failBySubject = quad(
    namedNode("http://other"),
    namedNode("http://p-visible"),
    namedNode("http://o"),
    defaultGraph(),
  );

  const failByExclude = quad(
    namedNode("http://s"),
    namedNode("http://p-hidden"),
    namedNode("http://o"),
    defaultGraph(),
  );

  assertEquals(matcher(pass), true);
  assertEquals(matcher(failBySubject), false);
  assertEquals(matcher(failByExclude), false);
});
