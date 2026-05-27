import type { Client } from "@libsql/client";
import type { Store } from "n3";
import type * as rdfjs from "@rdfjs/types";
import type { QuadFilter } from "@/client/quad-store/mod.ts";
import {
  DEFAULT_LIBSQL_MATCH_PAGE_SIZE,
  LibsqlQueryBuilder,
  quadFromLibsqlRow,
} from "@/client/adapters/libsql/mod.ts";

/** DEFAULT_HYDRATION_BATCH_SIZE caps peak heap during hydration by flushing quads into the N3 store in chunks. */
const DEFAULT_HYDRATION_BATCH_SIZE = 1000;

/** DEFAULT_HYDRATION_VECTOR_DIMENSIONS is the fallback vector width when no queryBuilder is supplied. */
const DEFAULT_HYDRATION_VECTOR_DIMENSIONS = 32;

/**
 * hydrateStoreFromLibsql reconstructs full in-memory state at lightning speeds by deserializing
 * relational tuples directly into Graph nodes, avoiding costly string parsing compute overhead.
 */
export async function hydrateStoreFromLibsql(
  client: Client,
  target: Store,
  filter?: QuadFilter,
  queryBuilder?: LibsqlQueryBuilder,
): Promise<number> {
  const resolvedQueryBuilder = queryBuilder ??
    new LibsqlQueryBuilder(DEFAULT_HYDRATION_VECTOR_DIMENSIONS);
  const pageSize = DEFAULT_LIBSQL_MATCH_PAGE_SIZE;
  const batchQuads: rdfjs.Quad[] = [];
  let hydratedCount = 0;
  let afterQuadId: string | undefined;

  for (;;) {
    const query = resolvedQueryBuilder.buildHydrateQuadsPageQuery(filter, {
      afterQuadId,
      limit: pageSize,
    });
    const resultSet = await client.execute(query);

    if (resultSet.rows.length === 0) {
      break;
    }

    for (const row of resultSet.rows) {
      afterQuadId = String(row.id);
      try {
        batchQuads.push(quadFromLibsqlRow(row));
        hydratedCount++;

        if (batchQuads.length >= DEFAULT_HYDRATION_BATCH_SIZE) {
          target.addQuads(batchQuads);
          batchQuads.length = 0;
        }
      } catch (err) {
        console.warn(
          `hydrateStoreFromLibsql: skipping corrupt row s="${row.s}"`,
          err,
        );
      }
    }

    if (resultSet.rows.length < pageSize) {
      break;
    }
  }

  if (batchQuads.length > 0) {
    target.addQuads(batchQuads);
  }

  return hydratedCount;
}
