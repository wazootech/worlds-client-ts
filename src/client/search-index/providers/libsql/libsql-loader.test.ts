import { assertEquals } from "@std/assert";
import { createClient } from "@libsql/client";
import { Store } from "n3";
import { makeLibsqlQuadsTable } from "./statements.ts";
import { hydrateStoreFromLibsql } from "./libsql-loader.ts";

Deno.test("Slice 4: Hydrator - recovers whole graph from stored serialized quad lines", async () => {
  const client = createClient({ url: ":memory:" });
  await client.execute(makeLibsqlQuadsTable());

  // Manually seed the raw table with granular component columns mimicking sync engine
  await client.execute({
    sql: `INSERT INTO quads (id, s, s_type, p, o, o_type, g, g_type) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      "hash1",
      "urn:e1",
      "NamedNode",
      "urn:p",
      "val1",
      "Literal",
      "",
      "DefaultGraph",
    ],
  });
  
  await client.execute({
    sql: `INSERT INTO quads (id, s, s_type, p, o, o_type, g, g_type) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      "hash2",
      "urn:e2",
      "NamedNode",
      "urn:p",
      "val2",
      "Literal",
      "",
      "DefaultGraph",
    ],
  });

  // Run the naive hydrator
  const targetStore = new Store();
  const count = await hydrateStoreFromLibsql(client, targetStore);

  // Assert exact counts match expectations
  assertEquals(count, 2, "Returned count does not match expected hydration quantity");
  assertEquals(targetStore.size, 2, "Physical N3 storage missed incoming loaded entities");
});
