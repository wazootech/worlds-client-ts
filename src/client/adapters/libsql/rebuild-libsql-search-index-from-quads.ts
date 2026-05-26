import type { Client } from "@libsql/client";
import type * as rdfjs from "@rdfjs/types";
import { filterQuads } from "@/client/quad-store/mod.ts";
import {
  type CommitPatchToLibsqlOptions,
  refreshSearchChunksForQuads,
} from "./commit-patch-to-libsql.ts";
import { quadFromLibsqlRow } from "./libsql-quad-row.ts";
import type { LibsqlQueryBuilder } from "./libsql-query-builder.ts";
import { DEFAULT_LIBSQL_MATCH_PAGE_SIZE } from "./libsql-query-builder.ts";

/**
 * RebuildLibsqlSearchIndexFromQuadsOptions configures a full search-index refresh from durable quads.
 */
export interface RebuildLibsqlSearchIndexFromQuadsOptions
  extends CommitPatchToLibsqlOptions {
  /** readPageSize limits quads loaded per SQL page while scanning the hexastore (default 1000). */
  readPageSize?: number;
}

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
  options: RebuildLibsqlSearchIndexFromQuadsOptions,
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
    const query = libsqlQueryBuilder.buildHydrateQuadsPageQuery(
      { include, exclude },
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
  dependencies:
    & {
      client: Client;
      libsqlQueryBuilder: LibsqlQueryBuilder;
    }
    & Omit<
      RebuildLibsqlSearchIndexFromQuadsOptions,
      "client" | "libsqlQueryBuilder"
    >,
): () => Promise<RebuildLibsqlSearchIndexFromQuadsResult> {
  return () =>
    rebuildLibsqlSearchIndexFromQuads({
      client: dependencies.client,
      libsqlQueryBuilder: dependencies.libsqlQueryBuilder,
      embeddingService: dependencies.embeddingService,
      textSplitter: dependencies.textSplitter,
      maxLookupChunkSize: dependencies.maxLookupChunkSize,
      maxWriteBatchSize: dependencies.maxWriteBatchSize,
      include: dependencies.include,
      exclude: dependencies.exclude,
      readPageSize: dependencies.readPageSize,
      labelPredicates: dependencies.labelPredicates,
    });
}
