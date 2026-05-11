import type { Client } from "@libsql/client";
import { Parser, Store } from "n3";

/**
 * hydrateStoreFromLibsql implements a naive, efficient bootstrap procedure that retrieves
 * the full historical master dataset from LibSQL and populates an active in-memory N3 store.
 * 
 * Returns the total count of successfully processed items.
 */
export async function hydrateStoreFromLibsql(
  client: Client,
  target: Store,
): Promise<number> {
  // 1. Query every individual saved Fact serialization from stable tables.
  // Optimization note: for massive datasets, this could migrate to pagination, 
  // but for single-user desktop graphs, full fetch yields sub-100ms hydration.
  const rs = await client.execute("SELECT nquad FROM quads");

  if (!rs.rows.length) return 0;

  // 2. Construct a generic streaming Parser set to standard N-Quads.
  const parser = new Parser({ format: "N-Quads" });

  let importedCount = 0;

  // 3. Line-by-line resolution to avoid huge string concats.
  for (const row of rs.rows) {
    const nquadLine = String(row.nquad);
    try {
      // Note: synchronous parsing is safe and fast for atomic single-line quads.
      const parsedQuads = parser.parse(nquadLine);
      if (parsedQuads.length > 0) {
        target.addQuads(parsedQuads);
        importedCount++;
      }
    } catch (_e) {
      // Ignore individual corrupted lines, potentially adding logging layer here later.
    }
  }

  return importedCount;
}
