import type { SearchRequest } from "#/client/search-index/search-index-interface.ts";

/**
 * libsqlQueryBuilder provides unified pure functions to dynamically construct both DDL schema definitions and active parameterized DML queries.
 */
export const libsqlQueryBuilder = {
  /**
   * buildLibsqlQuadsTable defines the DDL for the master source-of-truth Quad Storage.
   * It facilitates high-fidelity hydration of in-memory graph storage via serialized nquad strings.
   */
  buildLibsqlQuadsTable(): string {
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
  },

  /**
   * buildLibsqlChunksTable generates the DDL for backing relational store.
   */
  buildLibsqlChunksTable(): string {
    return `CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quad_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      predicate TEXT NOT NULL,
      graph TEXT NOT NULL,
      value TEXT NOT NULL,
      vector F32_BLOB(32)
    )`;
  },

  /**
   * buildLibsqlChunksQuadIdIndex creates an index to accelerate deletion by origin Quad ID.
   */
  buildLibsqlChunksQuadIdIndex(): string {
    return `CREATE INDEX IF NOT EXISTS idx_chunks_quad_id ON chunks (quad_id)`;
  },

  /**
   * buildLibsqlChunksFtsTable generates the DDL for accompanying virtual FTS index.
   */
  buildLibsqlChunksFtsTable(): string {
    return `CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
      value,
      content='chunks',
      content_rowid='id'
    )`;
  },

  /**
   * buildLibsqlChunksIndex generates the DDL for native vector similarity index.
   */
  buildLibsqlChunksIndex(): string {
    return `CREATE INDEX IF NOT EXISTS idx_chunks_vector ON chunks (
      libsql_vector_idx(vector, 'metric=cosine')
    )`;
  },

  /**
   * buildLibsqlChunksTriggers creates the synchronization triggers ensuring consistency with FTS.
   */
  buildLibsqlChunksTriggers(): string[] {
    return [
      `CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
        INSERT INTO chunks_fts(rowid, value) VALUES (new.id, new.value);
      END;`,
      `CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
        INSERT INTO chunks_fts(chunks_fts, rowid, value) VALUES('delete', old.id, old.value);
      END;`,
    ];
  },

  /**
   * buildInsertChunk creates the query and arguments for inserting a chunk row.
   */
  buildInsertChunk(options: {
    quad_id: string;
    subject: string;
    predicate: string;
    graph: string;
    value: string;
    vectorJson: string;
  }): { sql: string; args: (string | number)[] } {
    return {
      sql:
        `INSERT INTO chunks (quad_id, subject, predicate, graph, value, vector)
            VALUES (?, ?, ?, ?, ?, vector32(?))`,
      args: [
        options.quad_id,
        options.subject,
        options.predicate,
        options.graph,
        options.value,
        options.vectorJson,
      ],
    };
  },

  /**
   * buildDeleteByQuadIds creates the query to sweep away existing chunks belonging to stable Quad IDs.
   */
  buildDeleteByQuadIds(
    quadIds: string[],
  ): { sql: string; args: string[] } {
    const placeholders = generatePlaceholders(quadIds.length);
    return {
      sql: `DELETE FROM chunks WHERE quad_id IN (${placeholders})`,
      args: quadIds,
    };
  },

  /**
   * buildDeleteQuadsByQuadIds sweeps the master facts storage by ID.
   */
  buildDeleteQuadsByQuadIds(
    quadIds: string[],
  ): { sql: string; args: string[] } {
    const placeholders = generatePlaceholders(quadIds.length);
    return {
      sql: `DELETE FROM quads WHERE id IN (${placeholders})`,
      args: quadIds,
    };
  },

  /**
   * buildSelectExistingQuadIds constructs a query to retrieve pre-existing Quad IDs to drive content-addressed deduplication.
   */
  buildSelectExistingQuadIds(
    quadIds: string[],
  ): { sql: string; args: string[] } {
    const placeholders = generatePlaceholders(quadIds.length);
    return {
      sql: `SELECT id FROM quads WHERE id IN (${placeholders})`,
      args: quadIds,
    };
  },

  /**
   * buildInsertQuad generates query to store atomic raw fact safely for backup reconstruction.
   */
  buildInsertQuad(options: {
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
        options.quad_id,
        options.s,
        options.s_type,
        options.p,
        options.o,
        options.o_type,
        options.o_datatype ?? null,
        options.o_lang ?? null,
        options.g,
        options.g_type,
      ],
    };
  },

  /**
   * buildSearchQuery assembles the optimized hybrid search query leveraging RRF logic.
   *
   * The hybrid scoring uses Reciprocal Rank Fusion (RRF) to combine vector and FTS
   * rankings. The rank offset of 60 is a standard RRF smoothing constant that
   * prevents zero-division and moderates the influence of high rankings.
   * The libsql `vector_top_k` table function performs ANN vector search via
   * the cosine similarity index on the `idx_chunks_vector` index.
   */
  buildSearchQuery(
    request: SearchRequest,
    options: { vectorJson?: string; limit: number },
  ): { sql: string; args: (string | number)[] } {
    const { vectorJson, limit } = options;

    // Construct dynamic filtering where conditions based on user constraints
    const whereClauses: string[] = [];
    const filterArgs: (string | number)[] = [];

    // Map boundary conditions onto declarative relational data structures
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

    // Consolidate multi-dimensional scoping constraints declaratively
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

    // CASE 1: TOTAL HYBRID SEARCH (Mode A)
    if (hasVector && hasQuery) {
      const args: (string | number)[] = [
        vectorJson!,
        limit,
        request.query,
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

    // CASE 2: SEMANTIC / VECTOR ONLY SEARCH (Mode C)
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

    // CASE 3: FTS / KEYWORD ONLY SEARCH (Mode B)
    if (hasQuery) {
      const args: (string | number)[] = [
        request.query,
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

    // CASE 4: NO CRITERIA PROVIDED - Empty fallback
    return {
      sql:
        "SELECT NULL as subject, NULL as predicate, NULL as graph, NULL as value, 0 as combined_rank WHERE 0 = 1",
      args: [],
    };
  },
} as const;

// ==========================================
// PRIVATE RELATIONAL GENERATION HELPERS
// ==========================================

/**
 * generatePlaceholders generates a comma-delimited set of parameterized SQLite bound variables.
 */
function generatePlaceholders(count: number): string {
  return Array(count).fill("?").join(", ");
}
