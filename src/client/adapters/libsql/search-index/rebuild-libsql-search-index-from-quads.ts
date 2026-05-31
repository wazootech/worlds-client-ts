import type * as rdfjs from "@rdfjs/types";
import { filterQuads } from "@/client/quad-store/mod.ts";
import {
  type CommitPatchToLibsqlOptions,
  refreshSearchChunksForQuads,
} from "@/client/adapters/libsql/rdfjs-store/sync/commit-patch-to-libsql.ts";
import { quadFromLibsqlRow } from "@/client/adapters/libsql/rdfjs-store/sql/libsql-quad-row.ts";
import { DEFAULT_LIBSQL_MATCH_PAGE_SIZE } from "@/client/adapters/libsql/rdfjs-store/sql/libsql-query-builder.ts";

/**
 * RebuildLibsqlSearchIndexFromQuadsResult reports how many quads and chunk rows were processed.
 */
export interface RebuildLibsqlSearchIndexFromQuadsResult {
  /** processedQuadCount is the number of quads read from durable storage. */
  processedQuadCount: number;
  /** chunkRowCount is the number of chunk rows written to FTS/vector tables. */
  chunkRowCount: number;
}

/**
 * rebuildLibsqlSearchIndexFromQuads rebuilds FTS and vector chunk rows from the `quads` table without re-importing graph data.
 *
 * Use after schema upgrades, label predicate changes, or discovery-index tuning so existing corpora pick up refreshed `fts_value` and vectors.
 */
export async function rebuildLibsqlSearchIndexFromQuads(
  options: CommitPatchToLibsqlOptions & { readPageSize?: number },
): Promise<RebuildLibsqlSearchIndexFromQuadsResult> {
  const {
    client,
    include,
    exclude,
    libsqlQueryBuilder,
    readPageSize,
  } = options;
  const pageSize = Math.max(
    1,
    Math.floor(readPageSize ?? DEFAULT_LIBSQL_MATCH_PAGE_SIZE),
  );
  const matcher = filterQuads({ include, exclude });

  let processedQuadCount = 0;
  let chunkRowCount = 0;
  let afterQuadId: string | undefined;

  for (;;) {
    const query = libsqlQueryBuilder.buildMatchQuadsQuery(
      { subject: null, predicate: null, object: null, graph: null },
      { afterQuadId, limit: pageSize },
    );
    const resultSet = await client.execute(query);

    if (resultSet.rows.length === 0) {
      break;
    }

    const pageQuads: rdfjs.Quad[] = [];
    for (const row of resultSet.rows) {
      afterQuadId = String(row.id);
      try {
        const reconstructedQuad = quadFromLibsqlRow(row);
        if (matcher(reconstructedQuad)) {
          pageQuads.push(reconstructedQuad);
        }
        processedQuadCount++;
      } catch (error) {
        console.warn(
          `rebuildLibsqlSearchIndexFromQuads: skipping corrupt row s="${row.s}"`,
          error,
        );
      }
    }

    if (pageQuads.length > 0) {
      chunkRowCount += await refreshSearchChunksForQuads(pageQuads, options);
    }

    if (resultSet.rows.length < pageSize) {
      break;
    }
  }

  return { processedQuadCount, chunkRowCount };
}

/**
 * createLibsqlSearchIndexRebuilder returns a closure that rebuilds search chunks using stable LibSQL dependencies.
 */
export function createLibsqlSearchIndexRebuilder(
  dependencies: CommitPatchToLibsqlOptions & { readPageSize?: number },
): () => Promise<RebuildLibsqlSearchIndexFromQuadsResult> {
  return () => rebuildLibsqlSearchIndexFromQuads(dependencies);
}
