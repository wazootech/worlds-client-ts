import type { QuadFilter } from "@worlds/client/quad-store";
import type { SearchRequest } from "@worlds/client/search-index";

/** Maximum embedding dimensions accepted by LibsqlQueryBuilder (LibSQL / resource guardrail). */
const LIBSQL_QUERY_BUILDER_MAX_VECTOR_DIMENSIONS = 8192;
const LIBSQL_FTS_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "been",
  "being",
  "but",
  "by",
  "did",
  "do",
  "does",
  "for",
  "from",
  "had",
  "has",
  "have",
  "how",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "me",
  "my",
  "not",
  "of",
  "on",
  "or",
  "our",
  "please",
  "that",
  "the",
  "their",
  "these",
  "those",
  "this",
  "to",
  "us",
  "was",
  "we",
  "were",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "with",
  "you",
  "your",
]);

/**
 * LibsqlQueryBuilder exposes DDL/DML helpers bound to a single vector dimension for schema and hybrid search consistency.
 */
export class LibsqlQueryBuilder {
  public readonly vectorDimensions: number;

  public constructor(vectorDimensions: number) {
    const dimensions = Math.floor(Number(vectorDimensions));
    if (
      !Number.isFinite(dimensions) ||
      dimensions < 1 ||
      dimensions > LIBSQL_QUERY_BUILDER_MAX_VECTOR_DIMENSIONS
    ) {
      throw new Error(
        `vectorDimensions must be a finite integer in [1, ${LIBSQL_QUERY_BUILDER_MAX_VECTOR_DIMENSIONS}], received: ${
          String(vectorDimensions)
        }`,
      );
    }
    this.vectorDimensions = dimensions;
  }

  /**
   * buildHexastoreIndexes returns DDL for 7 covering composite indexes on the quads table
   * (6 SPOG permutations + 1 GPSO for graph-scoped access) enabling any triple or quad pattern
   * to be resolved via a single index seek.
   */
  public buildHexastoreIndexes(): string[] {
    return [
      "CREATE INDEX IF NOT EXISTS idx_quads_spog ON quads(s, p, o, g)",
      "CREATE INDEX IF NOT EXISTS idx_quads_sopg ON quads(s, o, p, g)",
      "CREATE INDEX IF NOT EXISTS idx_quads_pso ON quads(p, s, o)",
      "CREATE INDEX IF NOT EXISTS idx_quads_pos ON quads(p, o, s)",
      "CREATE INDEX IF NOT EXISTS idx_quads_ospg ON quads(o, s, p, g)",
      "CREATE INDEX IF NOT EXISTS idx_quads_opsg ON quads(o, p, s, g)",
      "CREATE INDEX IF NOT EXISTS idx_quads_gpso ON quads(g, p, s, o)",
    ];
  }

  public buildLibsqlQuadsTable(): string {
    return `CREATE TABLE IF NOT EXISTS quads (
    id TEXT PRIMARY KEY,
    s TEXT NOT NULL,
    s_type TEXT NOT NULL,
    p TEXT NOT NULL,
    o TEXT NOT NULL,
    o_type TEXT NOT NULL,
    o_datatype TEXT,
    o_lang TEXT,
    g TEXT NOT NULL,
    g_type TEXT NOT NULL
  )`;
  }

  public buildLibsqlChunksTable(): string {
    return `CREATE TABLE IF NOT EXISTS chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quad_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    predicate TEXT NOT NULL,
    graph TEXT NOT NULL,
    value TEXT NOT NULL,
    vector F32_BLOB(${this.vectorDimensions})
  )`;
  }

  public buildLibsqlChunksQuadIdIndex(): string {
    return `CREATE INDEX IF NOT EXISTS idx_chunks_quad_id ON chunks (quad_id)`;
  }

  public buildLibsqlChunksFtsTable(): string {
    return `CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
    value,
    content='chunks',
    content_rowid='id'
  )`;
  }

  public buildLibsqlChunksIndex(): string {
    return `CREATE INDEX IF NOT EXISTS idx_chunks_vector ON chunks (
    libsql_vector_idx(vector, 'metric=cosine')
  )`;
  }

  public buildLibsqlChunksTriggers(): string[] {
    return [
      `CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
      INSERT INTO chunks_fts(rowid, value) VALUES (new.id, new.value);
    END;`,
      `CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
      INSERT INTO chunks_fts(chunks_fts, rowid, value) VALUES('delete', old.id, old.value);
    END;`,
    ];
  }

  public buildInsertChunk(insertOptions: {
    quad_id: string;
    subject: string;
    predicate: string;
    graph: string;
    value: string;
    vectorJson?: string | null;
  }): { sql: string; args: (string | number)[] } {
    const hasVector = !!insertOptions.vectorJson;
    const vectorExpr = hasVector ? "vector32(?)" : "NULL";
    const args: (string | number)[] = [
      insertOptions.quad_id,
      insertOptions.subject,
      insertOptions.predicate,
      insertOptions.graph,
      insertOptions.value,
    ];
    if (hasVector) {
      args.push(insertOptions.vectorJson!);
    }
    return {
      sql:
        `INSERT INTO chunks (quad_id, subject, predicate, graph, value, vector)
          VALUES (?, ?, ?, ?, ?, ${vectorExpr})`,
      args,
    };
  }

  public buildDeleteByQuadIds(
    quadIds: string[],
  ): { sql: string; args: string[] } {
    const placeholders = generatePlaceholders(quadIds.length);
    return {
      sql: `DELETE FROM chunks WHERE quad_id IN (${placeholders})`,
      args: quadIds,
    };
  }

  public buildDeleteQuadsByQuadIds(
    quadIds: string[],
  ): { sql: string; args: string[] } {
    const placeholders = generatePlaceholders(quadIds.length);
    return {
      sql: `DELETE FROM quads WHERE id IN (${placeholders})`,
      args: quadIds,
    };
  }

  public buildSelectExistingQuadIds(
    quadIds: string[],
  ): { sql: string; args: string[] } {
    const placeholders = generatePlaceholders(quadIds.length);
    return {
      sql: `SELECT id FROM quads WHERE id IN (${placeholders})`,
      args: quadIds,
    };
  }

  public buildHydrateQuery(
    filter?: QuadFilter,
  ): { sql: string; args: string[] } {
    const whereClauses: string[] = [];
    const filterArgs: string[] = [];

    const filterConfigurations = [
      {
        values: filter?.exclude?.subjects,
        column: "s",
        operator: "NOT IN",
      },
      {
        values: filter?.exclude?.predicates,
        column: "p",
        operator: "NOT IN",
      },
      {
        values: filter?.exclude?.graphs,
        column: "g",
        operator: "NOT IN",
      },
      {
        values: filter?.include?.subjects,
        column: "s",
        operator: "IN",
      },
      {
        values: filter?.include?.predicates,
        column: "p",
        operator: "IN",
      },
      {
        values: filter?.include?.graphs,
        column: "g",
        operator: "IN",
      },
    ] as const;

    for (const { values, column, operator } of filterConfigurations) {
      if (values?.length) {
        const placeholders = generatePlaceholders(values.length);
        whereClauses.push(`${column} ${operator} (${placeholders})`);
        filterArgs.push(...values);
      }
    }

    const whereFilter = whereClauses.length > 0
      ? `WHERE ${whereClauses.join(" AND ")}`
      : "";

    return {
      sql:
        `SELECT s, s_type, p, o, o_type, o_datatype, o_lang, g, g_type FROM quads ${whereFilter}`,
      args: filterArgs,
    };
  }

  public buildInsertQuad(insertQuadOptions: {
    quad_id: string;
    s: string;
    s_type: string;
    p: string;
    o: string;
    o_type: string;
    o_datatype?: string | null;
    o_lang?: string | null;
    g: string;
    g_type: string;
  }): { sql: string; args: (string | null)[] } {
    return {
      sql:
        `INSERT OR REPLACE INTO quads (id, s, s_type, p, o, o_type, o_datatype, o_lang, g, g_type)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        insertQuadOptions.quad_id,
        insertQuadOptions.s,
        insertQuadOptions.s_type,
        insertQuadOptions.p,
        insertQuadOptions.o,
        insertQuadOptions.o_type,
        insertQuadOptions.o_datatype ?? null,
        insertQuadOptions.o_lang ?? null,
        insertQuadOptions.g,
        insertQuadOptions.g_type,
      ],
    };
  }

  public sanitizeFtsQuery(query: string): string {
    return sanitizeFtsQuery(query);
  }

  public buildSearchQuery(
    request: SearchRequest,
    searchBuildOptions: { vectorJson?: string; limit: number },
  ): { sql: string; args: (string | number)[] } {
    const { vectorJson, limit } = searchBuildOptions;

    const whereClauses: string[] = [];
    const filterArgs: (string | number)[] = [];

    const filterConfigurations = [
      {
        values: request.exclude?.subjects,
        column: "chunks.subject",
        operator: "NOT IN",
      },
      {
        values: request.exclude?.predicates,
        column: "chunks.predicate",
        operator: "NOT IN",
      },
      {
        values: request.exclude?.graphs,
        column: "chunks.graph",
        operator: "NOT IN",
      },
      {
        values: request.include?.subjects,
        column: "chunks.subject",
        operator: "IN",
      },
      {
        values: request.include?.predicates,
        column: "chunks.predicate",
        operator: "IN",
      },
      {
        values: request.include?.graphs,
        column: "chunks.graph",
        operator: "IN",
      },
    ] as const;

    for (const { values, column, operator } of filterConfigurations) {
      if (values?.length) {
        const placeholders = generatePlaceholders(values.length);
        whereClauses.push(`${column} ${operator} (${placeholders})`);
        filterArgs.push(...values);
      }
    }

    const whereFilter = whereClauses.length > 0
      ? `WHERE ${whereClauses.join(" AND ")}`
      : "";

    const hasVector = !!vectorJson;
    const hasQuery = !!request.query && request.query.trim().length > 0;
    const sanitizedQuery = hasQuery ? sanitizeFtsQuery(request.query) : "";

    if (hasVector && hasQuery) {
      const args: (string | number)[] = [
        vectorJson!,
        limit,
        sanitizedQuery,
        limit,
        ...filterArgs,
        limit,
      ];

      const sql = `
      WITH vec_matches AS (
        SELECT
          id AS rowid,
          row_number() OVER (PARTITION BY NULL) AS rank_number
        FROM
          vector_top_k('idx_chunks_vector', vector32(?), ?)
      ),
      fts_matches AS (
        SELECT
          rowid,
          row_number() OVER (ORDER BY rank) AS rank_number,
          rank AS score
        FROM
          chunks_fts
        WHERE
          chunks_fts MATCH ?
        LIMIT ?
      ), final AS (
        SELECT
          chunks.subject,
          chunks.predicate,
          chunks.graph,
          chunks.value,
          (
            COALESCE(1.0 / (60 + fts_matches.rank_number), 0.0) * 1.0 + 
            COALESCE(1.0 / (60 + vec_matches.rank_number), 0.0) * 1.0
          ) AS combined_rank
        FROM
          fts_matches
          FULL OUTER JOIN vec_matches ON vec_matches.rowid = fts_matches.rowid
          JOIN chunks ON chunks.id = COALESCE(fts_matches.rowid, vec_matches.rowid)
        ${whereFilter}
        ORDER BY
          combined_rank DESC
        LIMIT ?
      )
      SELECT * FROM final;
    `;
      return { sql, args };
    }

    if (hasVector) {
      const args: (string | number)[] = [
        vectorJson!,
        limit,
        ...filterArgs,
        limit,
      ];

      const sql = `
      WITH vec_matches AS (
        SELECT
          id AS rowid,
          row_number() OVER (PARTITION BY NULL) AS rank_number
        FROM
          vector_top_k('idx_chunks_vector', vector32(?), ?)
      ), final AS (
        SELECT
          chunks.subject,
          chunks.predicate,
          chunks.graph,
          chunks.value,
          COALESCE(1.0 / (60 + vec_matches.rank_number), 0.0) AS combined_rank
        FROM
          vec_matches
          JOIN chunks ON chunks.id = vec_matches.rowid
        ${whereFilter}
        ORDER BY
          combined_rank DESC
        LIMIT ?
      )
      SELECT * FROM final;
    `;
      return { sql, args };
    }

    if (hasQuery) {
      const args: (string | number)[] = [
        sanitizedQuery,
        limit,
        ...filterArgs,
        limit,
      ];

      const sql = `
      WITH fts_matches AS (
        SELECT
          rowid,
          row_number() OVER (ORDER BY rank) AS rank_number,
          rank AS score
        FROM
          chunks_fts
        WHERE
          chunks_fts MATCH ?
        LIMIT ?
      ), final AS (
        SELECT
          chunks.subject,
          chunks.predicate,
          chunks.graph,
          chunks.value,
          COALESCE(1.0 / (60 + fts_matches.rank_number), 0.0) AS combined_rank
        FROM
          fts_matches
          JOIN chunks ON chunks.id = fts_matches.rowid
        ${whereFilter}
        ORDER BY
          combined_rank DESC
        LIMIT ?
      )
      SELECT * FROM final;
    `;
      return { sql, args };
    }

    return {
      sql:
        "SELECT NULL as subject, NULL as predicate, NULL as graph, NULL as value, 0 as combined_rank WHERE 0 = 1",
      args: [],
    };
  }
}

/**
 * defaultLibsqlQueryBuilder is the default 32-dimensional builder for callers that do not vary embedding width.
 */
export const defaultLibsqlQueryBuilder: LibsqlQueryBuilder =
  new LibsqlQueryBuilder(
    32,
  );

/**
 * sanitizeFtsQuery defends SQLite against internal parsing crash vectors
 * by splitting inputs into safe alphanumeric tokens, stripping filler words,
 * and wrapping the remaining content words in explicit quotes.
 */
function sanitizeFtsQuery(query: string): string {
  const tokens = query
    .split(/\s+/)
    .map((token) =>
      token
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "")
    )
    .filter((token) => token.length > 0);

  const filteredTokens = tokens.filter((token) =>
    !LIBSQL_FTS_STOPWORDS.has(token)
  );
  const normalizedTokens = filteredTokens.length > 0 ? filteredTokens : tokens;

  return normalizedTokens
    .map((token) => `"${token.replace(/"/g, "")}"`)
    .join(" ");
}

/**
 * generatePlaceholders generates a comma-delimited set of parameterized SQLite bound variables.
 */
function generatePlaceholders(count: number): string {
  return Array(count).fill("?").join(", ");
}
