import { assertEquals } from "@std/assert";
import { createClient } from "@libsql/client";
import { LibsqlQueryBuilder } from "./libsql-query-builder.ts";

const testLibsqlQueryBuilder = new LibsqlQueryBuilder(32);

Deno.test("buildHexastoreIndexes - returns 7 covering index DDL statements", () => {
  const indexes = testLibsqlQueryBuilder.buildHexastoreIndexes();
  assertEquals(indexes.length, 7);

  const subjectFirstQuadPatternIndex = indexes.find((s: string) =>
    s.includes("idx_quads_spog")
  );
  assertEquals(
    subjectFirstQuadPatternIndex,
    "CREATE INDEX IF NOT EXISTS idx_quads_spog ON quads(s, p, o, g)",
  );

  const sopgIndex = indexes.find((s: string) => s.includes("idx_quads_sopg"));
  assertEquals(
    sopgIndex,
    "CREATE INDEX IF NOT EXISTS idx_quads_sopg ON quads(s, o, p, g)",
  );

  const psoIndex = indexes.find((s: string) => s.includes("idx_quads_pso"));
  assertEquals(
    psoIndex,
    "CREATE INDEX IF NOT EXISTS idx_quads_pso ON quads(p, s, o)",
  );

  const posIndex = indexes.find((s: string) => s.includes("idx_quads_pos"));
  assertEquals(
    posIndex,
    "CREATE INDEX IF NOT EXISTS idx_quads_pos ON quads(p, o, s)",
  );

  const ospgIndex = indexes.find((s: string) => s.includes("idx_quads_ospg"));
  assertEquals(
    ospgIndex,
    "CREATE INDEX IF NOT EXISTS idx_quads_ospg ON quads(o, s, p, g)",
  );

  const opsgIndex = indexes.find((s: string) => s.includes("idx_quads_opsg"));
  assertEquals(
    opsgIndex,
    "CREATE INDEX IF NOT EXISTS idx_quads_opsg ON quads(o, p, s, g)",
  );

  const gpsoIndex = indexes.find((s: string) => s.includes("idx_quads_gpso"));
  assertEquals(
    gpsoIndex,
    "CREATE INDEX IF NOT EXISTS idx_quads_gpso ON quads(g, p, s, o)",
  );
});

Deno.test("buildHexastoreIndexes - indexes are idempotent (CREATE IF NOT EXISTS)", async () => {
  const db = createClient({ url: ":memory:" });
  await db.execute(testLibsqlQueryBuilder.buildLibsqlQuadsTable());

  for (const ddl of testLibsqlQueryBuilder.buildHexastoreIndexes()) {
    await db.execute(ddl);
  }

  // Second pass must not throw
  for (const ddl of testLibsqlQueryBuilder.buildHexastoreIndexes()) {
    await db.execute(ddl);
  }

  // Verify all 7 indexes exist
  const resultSet = await db.execute(
    "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_quads_%'",
  );
  const indexNames = resultSet.rows.map((r) => String(r.name)).sort();
  assertEquals(indexNames, [
    "idx_quads_gpso",
    "idx_quads_opsg",
    "idx_quads_ospg",
    "idx_quads_pos",
    "idx_quads_pso",
    "idx_quads_sopg",
    "idx_quads_spog",
  ]);
});

Deno.test("sanitizeFtsQuery - strips common stopwords while preserving content words", () => {
  assertEquals(
    testLibsqlQueryBuilder.sanitizeFtsQuery("What is the capital of Aurelia?"),
    `"capital" "aurelia"`,
  );
});

Deno.test("sanitizeFtsQuery - preserves original tokens when the query is stopword-only", () => {
  assertEquals(
    testLibsqlQueryBuilder.sanitizeFtsQuery("what is the"),
    `"what" "is" "the"`,
  );
});

Deno.test(
  "buildBulkInsertQuads - chunks rows under SQLite host-parameter budget",
  () => {
    const insertQuadRows = Array.from({ length: 85 }, (_, index) => ({
      quad_id: `id-${index}`,
      s: `urn:s:${index}`,
      s_type: "NamedNode",
      p: "urn:p",
      o: `literal ${index}`,
      o_type: "Literal",
      o_datatype: null,
      o_lang: null,
      g: "",
      g_type: "DefaultGraph",
    }));

    const statements = testLibsqlQueryBuilder.buildBulkInsertQuads(
      insertQuadRows,
    );
    assertEquals(statements.length, 2);
    assertEquals(
      (statements[0].sql.match(/\(\?, \?, \?, \?, \?, \?, \?, \?, \?, \?\)/g) ??
        []).length,
      80,
    );
    assertEquals(statements[0].args.length, 800);
    assertEquals(
      (statements[1].sql.match(/\(\?, \?, \?, \?, \?, \?, \?, \?, \?, \?\)/g) ??
        []).length,
      5,
    );
    assertEquals(statements[1].args.length, 50);
  },
);

Deno.test(
  "buildBulkInsertQuads - single row matches buildInsertQuad shape",
  () => {
    const insertQuadRow = {
      quad_id: "quad-hash",
      s: "urn:subject",
      s_type: "NamedNode",
      p: "urn:predicate",
      o: "object text",
      o_type: "Literal",
      o_datatype: "http://www.w3.org/2001/XMLSchema#string",
      o_lang: "en",
      g: "urn:graph",
      g_type: "NamedNode",
    };

    const bulkStatement = testLibsqlQueryBuilder.buildBulkInsertQuads([
      insertQuadRow,
    ])[0];
    const singleStatement = testLibsqlQueryBuilder.buildInsertQuad(
      insertQuadRow,
    );

    assertEquals(bulkStatement.sql, singleStatement.sql);
    assertEquals(bulkStatement.args, singleStatement.args);
  },
);
