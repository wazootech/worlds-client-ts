import type * as rdfjs from "@rdfjs/types";
import type { QuadFilter } from "@/client/quad-store/mod.ts";
import type { SearchRequest } from "@/client/search-index/mod.ts";

/** rdfLangStringIri is the RDF datatype for language-tagged literals in N3/RDF/JS. */
const rdfLangStringIri =
  "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString";

/** xsdStringIri is the XSD string datatype IRI. */
const xsdStringIri = "http://www.w3.org/2001/XMLSchema#string";

/**
 * LibsqlQuadPattern holds optional bound RDF/JS terms for hexastore quad pattern matching.
 */
export interface LibsqlQuadPattern {
  /** subject is the optional bound subject term. */
  subject: rdfjs.Term | null;
  /** predicate is the optional bound predicate term. */
  predicate: rdfjs.Term | null;
  /** object is the optional bound object term. */
  object: rdfjs.Term | null;
  /** graph is the optional bound graph term. */
  graph: rdfjs.Term | null;
}

/**
 * LibsqlQuadPatternWhereClause is the SQL fragment and bound args for a quad pattern filter.
 */
export interface LibsqlQuadPatternWhereClause {
  /** conditions are AND-joined predicates without a leading WHERE. */
  conditions: string[];
  /** args are bound parameters in statement order. */
  args: (string | null)[];
}

/** DEFAULT_LIBSQL_MATCH_PAGE_SIZE caps rows per hexastore match SQL round-trip. */
export const DEFAULT_LIBSQL_MATCH_PAGE_SIZE = 1000;

/** BULK_INSERT_QUAD_COLUMN_COUNT is host parameters per quad row in bulk INSERT statements. */
const BULK_INSERT_QUAD_COLUMN_COUNT = 10;

/**
 * BULK_INSERT_QUAD_ROWS_PER_STATEMENT caps rows per INSERT under SQLite 999 host-parameter limit with headroom.
 */
export const BULK_INSERT_QUAD_ROWS_PER_STATEMENT = 80;

/** InsertQuadRow is one relational quad row bound for INSERT OR REPLACE into quads. */
export interface InsertQuadRow {
  /** quad_id is the stable hash identifier for the quad row. */
  quad_id: string;
  /** s is the subject IRI or node value. */
  s: string;
  /** s_type is the RDF term type for the subject. */
  s_type: string;
  /** p is the predicate IRI. */
  p: string;
  /** o is the object value. */
  o: string;
  /** o_type is the RDF term type for the object. */
  o_type: string;
  /** o_datatype is the literal datatype IRI when the object is typed. */
  o_datatype?: string | null;
  /** o_lang is the literal language tag when present. */
  o_lang?: string | null;
  /** g is the graph name value. */
  g: string;
  /** g_type is the RDF term type for the graph slot. */
  g_type: string;
}

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
   * (six subject-predicate-object-graph index orders + GPSO for graph-scoped access) enabling any quad pattern
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
    fts_value TEXT NOT NULL,
    vector F32_BLOB(${this.vectorDimensions})
  )`;
  }

  public buildLibsqlChunksQuadIdIndex(): string {
    return `CREATE INDEX IF NOT EXISTS idx_chunks_quad_id ON chunks (quad_id)`;
  }

  public buildLibsqlChunksFtsTable(): string {
    return `CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
    fts_value,
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
      INSERT INTO chunks_fts(rowid, fts_value) VALUES (new.id, new.fts_value);
    END;`,
      `CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
      INSERT INTO chunks_fts(chunks_fts, rowid, fts_value) VALUES('delete', old.id, old.fts_value);
    END;`,
    ];
  }

  /**
   * buildMigrateChunksFtsValueColumn returns DDL to add fts_value when upgrading legacy databases.
   */
  public buildMigrateChunksFtsValueColumn(): string {
    return "ALTER TABLE chunks ADD COLUMN fts_value TEXT";
  }

  /**
   * buildBackfillChunksFtsValueFromValue copies literal value into fts_value for rows missing discovery text.
   */
  public buildBackfillChunksFtsValueFromValue(): string {
    return "UPDATE chunks SET fts_value = value WHERE fts_value IS NULL OR fts_value = ''";
  }

  /**
   * buildDropChunksFtsTriggers returns statements that remove legacy FTS sync triggers before recreation.
   */
  public buildDropChunksFtsTriggers(): string[] {
    return [
      "DROP TRIGGER IF EXISTS chunks_ai",
      "DROP TRIGGER IF EXISTS chunks_ad",
    ];
  }

  /**
   * buildDropChunksFtsTable drops the FTS5 virtual table so it can be recreated with fts_value indexing.
   */
  public buildDropChunksFtsTable(): string {
    return "DROP TABLE IF EXISTS chunks_fts";
  }

  /**
   * buildRebuildChunksFtsIndex rebuilds the external FTS index from the chunks content table.
   */
  public buildRebuildChunksFtsIndex(): string {
    return "INSERT INTO chunks_fts(chunks_fts) VALUES('rebuild')";
  }

  public buildInsertChunk(insertOptions: {
    quad_id: string;
    subject: string;
    predicate: string;
    graph: string;
    value: string;
    fts_value: string;
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
      insertOptions.fts_value,
    ];
    if (hasVector) {
      args.push(insertOptions.vectorJson!);
    }
    return {
      sql:
        `INSERT INTO chunks (quad_id, subject, predicate, graph, value, fts_value, vector)
          VALUES (?, ?, ?, ?, ?, ?, ${vectorExpr})`,
      args,
    };
  }

  /**
   * buildSelectLabelLiteralsForSubjects returns label predicate object values grouped by subject IRI.
   */
  public buildSelectLabelLiteralsForSubjects(
    subjects: string[],
    labelPredicates: string[],
  ): { sql: string; args: string[] } {
    const subjectPlaceholders = generatePlaceholders(subjects.length);
    const predicatePlaceholders = generatePlaceholders(labelPredicates.length);
    return {
      sql:
        `SELECT s, o FROM quads WHERE s IN (${subjectPlaceholders}) AND p IN (${predicatePlaceholders}) AND o_type = 'Literal' ORDER BY s, o`,
      args: [...subjects, ...labelPredicates],
    };
  }

  /**
   * buildSelectTextualLiteralQuadsForSubjects returns durable quads with textual objects for the given subjects.
   */
  public buildSelectTextualLiteralQuadsForSubjects(
    subjects: string[],
  ): { sql: string; args: string[] } {
    const subjectPlaceholders = generatePlaceholders(subjects.length);
    return {
      sql:
        `SELECT id, s, s_type, p, o, o_type, o_datatype, o_lang, g, g_type FROM quads WHERE s IN (${subjectPlaceholders}) AND o_type = 'Literal' AND (o_datatype IS NULL OR o_datatype = '' OR o_datatype = 'http://www.w3.org/2001/XMLSchema#string' OR o_lang IS NOT NULL AND o_lang != '') ORDER BY id ASC`,
      args: subjects,
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

  /**
   * buildMatchQuadsQuery returns SQL to read quads for a pattern, optionally keyset-paged by id.
   */
  public buildMatchQuadsQuery(
    pattern: LibsqlQuadPattern,
    pageOptions?: { afterQuadId?: string; limit?: number },
  ): { sql: string; args: (string | null)[] } {
    const { conditions, args } = buildLibsqlQuadPatternWhereClause(pattern);

    if (pageOptions?.afterQuadId) {
      conditions.push("id > ?");
      args.push(pageOptions.afterQuadId);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    let limitClause = "";
    if (pageOptions?.limit != null) {
      limitClause = " LIMIT ?";
      args.push(String(Math.max(1, Math.floor(pageOptions.limit))));
    }

    return {
      sql:
        `SELECT id, s, s_type, p, o, o_type, o_datatype, o_lang, g, g_type FROM quads ${whereClause} ORDER BY id ASC${limitClause}`,
      args,
    };
  }

  /**
   * buildCountQuadsQuery returns SQL to count quads matching a hexastore pattern.
   */
  public buildCountQuadsQuery(
    pattern: LibsqlQuadPattern,
  ): { sql: string; args: (string | null)[] } {
    const { conditions, args } = buildLibsqlQuadPatternWhereClause(pattern);
    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    return {
      sql: `SELECT COUNT(*) AS count FROM quads ${whereClause}`,
      args,
    };
  }

  public buildInsertQuad(
    insertQuadOptions: InsertQuadRow,
  ): { sql: string; args: (string | null)[] } {
    return this.buildBulkInsertQuads([insertQuadOptions])[0];
  }

  /**
   * buildBulkInsertQuads emits multi-row INSERT OR REPLACE statements chunked under SQLite host-parameter limits.
   */
  public buildBulkInsertQuads(
    insertQuadRows: InsertQuadRow[],
  ): Array<{ sql: string; args: (string | null)[] }> {
    if (insertQuadRows.length === 0) {
      return [];
    }

    const statements: Array<{ sql: string; args: (string | null)[] }> = [];

    for (
      let rowOffset = 0;
      rowOffset < insertQuadRows.length;
      rowOffset += BULK_INSERT_QUAD_ROWS_PER_STATEMENT
    ) {
      const rowBatch = insertQuadRows.slice(
        rowOffset,
        rowOffset + BULK_INSERT_QUAD_ROWS_PER_STATEMENT,
      );
      const valuePlaceholders = rowBatch
        .map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .join(", ");
      const args: (string | null)[] = [];

      for (const insertQuadRow of rowBatch) {
        args.push(
          insertQuadRow.quad_id,
          insertQuadRow.s,
          insertQuadRow.s_type,
          insertQuadRow.p,
          insertQuadRow.o,
          insertQuadRow.o_type,
          insertQuadRow.o_datatype ?? null,
          insertQuadRow.o_lang ?? null,
          insertQuadRow.g,
          insertQuadRow.g_type,
        );
      }

      if (
        args.length > BULK_INSERT_QUAD_ROWS_PER_STATEMENT *
            BULK_INSERT_QUAD_COLUMN_COUNT
      ) {
        throw new Error(
          `buildBulkInsertQuads: batch exceeds SQLite host-parameter budget (${args.length})`,
        );
      }

      statements.push({
        sql:
          `INSERT OR REPLACE INTO quads (id, s, s_type, p, o, o_type, o_datatype, o_lang, g, g_type) VALUES ${valuePlaceholders}`,
        args,
      });
    }

    return statements;
  }

  public sanitizeFtsQuery(query: string): string {
    return sanitizeFtsQuery(query);
  }

  public buildSearchQuery(
    request: SearchRequest,
    searchBuildOptions: { vectorJson?: string; limit: number },
  ): { sql: string; args: (string | number)[] } {
    const { vectorJson, limit } = searchBuildOptions;

    const { whereClauses, filterArgs } = buildIncludeExcludeFilterClauses(
      request,
      CHUNKS_TABLE_COLUMNS,
    );

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

/** ColumnMapping maps QuadFilter dimensions to SQL column names. */
interface ColumnMapping {
  subjects: string;
  predicates: string;
  graphs: string;
}

/** CHUNKS_TABLE_COLUMNS maps QuadFilter fields to chunks table column names. */
const CHUNKS_TABLE_COLUMNS: ColumnMapping = {
  subjects: "chunks.subject",
  predicates: "chunks.predicate",
  graphs: "chunks.graph",
};

/**
 * buildIncludeExcludeFilterClauses builds parameterized WHERE fragments from a QuadFilter using the given column mapping.
 */
function buildIncludeExcludeFilterClauses(
  filter: QuadFilter | undefined,
  columnMapping: ColumnMapping,
): { whereClauses: string[]; filterArgs: string[] } {
  const whereClauses: string[] = [];
  const filterArgs: string[] = [];

  const filterConfigurations = [
    {
      values: filter?.exclude?.subjects,
      column: columnMapping.subjects,
      operator: "NOT IN",
    },
    {
      values: filter?.exclude?.predicates,
      column: columnMapping.predicates,
      operator: "NOT IN",
    },
    {
      values: filter?.exclude?.graphs,
      column: columnMapping.graphs,
      operator: "NOT IN",
    },
    {
      values: filter?.include?.subjects,
      column: columnMapping.subjects,
      operator: "IN",
    },
    {
      values: filter?.include?.predicates,
      column: columnMapping.predicates,
      operator: "IN",
    },
    {
      values: filter?.include?.graphs,
      column: columnMapping.graphs,
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

  return { whereClauses, filterArgs };
}

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

/**
 * buildLibsqlQuadPatternWhereClause constructs WHERE conditions and args for a hexastore quad pattern.
 */
export function buildLibsqlQuadPatternWhereClause(
  pattern: LibsqlQuadPattern,
): LibsqlQuadPatternWhereClause {
  const conditions: string[] = [];
  const args: (string | null)[] = [];

  appendTermCondition(conditions, args, "s", "s_type", pattern.subject);
  appendTermCondition(conditions, args, "o", "o_type", pattern.object);

  if (pattern.predicate) {
    conditions.push("p = ?");
    args.push(pattern.predicate.value);
  }

  appendTermCondition(conditions, args, "g", "g_type", pattern.graph);

  return { conditions, args };
}

/**
 * appendTermCondition adds WHERE clauses and args for a term that may be a NamedNode, BlankNode, or Literal.
 */
function appendTermCondition(
  conditions: string[],
  args: (string | null)[],
  valueColumn: string,
  typeColumn: string,
  term: rdfjs.Term | null,
): void {
  if (!term) return;

  conditions.push(`${valueColumn} = ?`);
  args.push(term.value);

  conditions.push(`${typeColumn} = ?`);
  args.push(term.termType);

  if (term.termType === "Literal") {
    const literalTerm = term as rdfjs.Literal;
    if (literalTerm.language) {
      conditions.push(`o_lang = ?`);
      args.push(literalTerm.language);
    }
    if (literalTerm.datatype) {
      const datatypeValue = literalTerm.datatype.value;
      if (
        datatypeValue === xsdStringIri ||
        datatypeValue === rdfLangStringIri
      ) {
        conditions.push(`o_datatype IS NULL`);
      } else {
        conditions.push(`o_datatype = ?`);
        args.push(datatypeValue);
      }
    }
  }
}
