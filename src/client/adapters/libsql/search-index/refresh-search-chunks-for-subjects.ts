import type * as rdfjs from "@rdfjs/types";

import { isTextualLiteral } from "@/client/quad-store/mod.ts";
import type { CommitPatchToLibsqlOptions } from "@/client/adapters/libsql/rdfjs-store/sync/commit-patch-to-libsql.ts";
import {
  DEFAULT_MAX_LOOKUP_CHUNK_SIZE,
  refreshSearchChunksForQuads,
} from "@/client/adapters/libsql/rdfjs-store/sync/commit-patch-to-libsql.ts";
import { quadFromLibsqlRow } from "@/client/adapters/libsql/rdfjs-store/sql/libsql-quad-row.ts";

/**
 * RefreshSearchChunksForSubjectsResult reports subject-scoped search index refresh counts.
 */
export interface RefreshSearchChunksForSubjectsResult {
  /** subjectCount is the number of distinct subject IRIs refreshed. */
  subjectCount: number;
  /** chunkRowCount is the number of chunk rows written. */
  chunkRowCount: number;
}

/**
 * refreshSearchChunksForSubjects rebuilds FTS/vector rows for all textual-literal quads of the given subjects.
 */
export async function refreshSearchChunksForSubjects(
  subjects: string[],
  options: CommitPatchToLibsqlOptions,
): Promise<RefreshSearchChunksForSubjectsResult> {
  const uniqueSubjects = Array.from(new Set(subjects));
  if (uniqueSubjects.length === 0) {
    return { subjectCount: 0, chunkRowCount: 0 };
  }

  const lookupChunkSize = options.maxLookupChunkSize ??
    DEFAULT_MAX_LOOKUP_CHUNK_SIZE;
  const quads: rdfjs.Quad[] = [];

  for (let index = 0; index < uniqueSubjects.length; index += lookupChunkSize) {
    const subjectBatch = uniqueSubjects.slice(index, index + lookupChunkSize);
    const query = options.libsqlQueryBuilder
      .buildSelectTextualLiteralQuadsForSubjects(subjectBatch);
    const resultSet = await options.client.execute(query);
    for (const row of resultSet.rows) {
      try {
        const reconstructedQuad = quadFromLibsqlRow(row);
        if (isTextualLiteral(reconstructedQuad.object)) {
          quads.push(reconstructedQuad);
        }
      } catch (cause) {
        throw new Error("failed to load textual quads for subject refresh", {
          cause,
        });
      }
    }
  }

  const chunkRowCount = await refreshSearchChunksForQuads(quads, options);
  return {
    subjectCount: uniqueSubjects.length,
    chunkRowCount,
  };
}
