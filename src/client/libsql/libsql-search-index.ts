import type { Client } from "@libsql/client";
import type {
  SearchIndexInterface,
  SearchRequest,
  SearchResponse,
  SearchResult,
} from "#/client/search-index/interface.ts";

/**
 * EmbeddingService describes an external interface used to generate vectors from text.
 */
export interface EmbeddingService {
  /**
   * Converts textual query into high-dimensional vector representation suitable for index comparison.
   */
  embed(text: string): Promise<Float32Array | number[]>;
}

/**
 * Options needed to construct the LibSQL search engine.
 */
export interface LibsqlSearchIndexOptions {
  /** Initialized @libsql/client instance pointing to target database. */
  client: Client;
  /** Capability for projecting textual search input into vector space. */
  embeddingService: EmbeddingService;
  /** Optional page sizing constraints, defaults to 100. */
  limit?: number;
}

/**
 * LibsqlSearchIndex is an implementation of the SearchIndexInterface that uses
 * an underlying LibSQL database to store and search the RDF store.
 *
 * It leverages the Reciprocal Rank Fusion (RRF) strategy to merge full-text search
 * relevance with vector semantic similarity.
 */
export class LibsqlSearchIndex implements SearchIndexInterface {
  private readonly client: Client;
  private readonly embeddingService: EmbeddingService;
  private readonly limit: number;

  constructor(options: LibsqlSearchIndexOptions) {
    this.client = options.client;
    this.embeddingService = options.embeddingService;
    this.limit = options.limit ?? 100;
  }

  public async search(request: SearchRequest): Promise<SearchResponse> {
    const vector = await this.embeddingService.embed(request.query);
    const vectorJson = JSON.stringify(Array.from(vector));

    // Build standard baseline arguments for hybrid fetch
    const args: (string | number)[] = [
      vectorJson,
      this.limit,
      request.query,
      this.limit,
    ];

    // Construct filtering where conditions based on constraints
    const whereClauses: string[] = [];

    // Exclusion rules
    if (request.exclude?.subjects?.length) {
      const placeholders = request.exclude.subjects.map(() => "?").join(", ");
      whereClauses.push(`facts.item_id NOT IN (${placeholders})`);
      args.push(...request.exclude.subjects);
    }
    if (request.exclude?.predicates?.length) {
      const placeholders = request.exclude.predicates.map(() => "?").join(", ");
      whereClauses.push(`facts.property NOT IN (${placeholders})`);
      args.push(...request.exclude.predicates);
    }

    // Inclusion rules
    if (request.include?.subjects?.length) {
      const placeholders = request.include.subjects.map(() => "?").join(", ");
      whereClauses.push(`facts.item_id IN (${placeholders})`);
      args.push(...request.include.subjects);
    }
    if (request.include?.predicates?.length) {
      const placeholders = request.include.predicates.map(() => "?").join(", ");
      whereClauses.push(`facts.property IN (${placeholders})`);
      args.push(...request.include.predicates);
    }

    const whereFilter = whereClauses.length > 0
      ? `WHERE ${whereClauses.join(" AND ")}`
      : "";

    // Add internal LIMIT parameter for the final output
    args.push(this.limit);

    // Compose query adhering to prior art spec
    const sql = `
      WITH vec_matches AS (
        SELECT
          id AS rowid,
          row_number() OVER (PARTITION BY NULL) AS rank_number
        FROM
          vector_top_k('idx_facts_vector', vector32(?), ?)
      ),
      fts_matches AS (
        SELECT
          rowid,
          row_number() OVER (ORDER BY rank) AS rank_number,
          rank AS score
        FROM
          facts_fts
        WHERE
          facts_fts MATCH ?
        LIMIT ?
      ), final AS (
        SELECT
          facts.item_id,
          facts.property,
          facts.value,
          (
            COALESCE(1.0 / (60 + fts_matches.rank_number), 0.0) * 1.0 + 
            COALESCE(1.0 / (60 + vec_matches.rank_number), 0.0) * 1.0
          ) AS combined_rank
        FROM
          fts_matches
          FULL OUTER JOIN vec_matches ON vec_matches.rowid = fts_matches.rowid
          JOIN facts ON facts.rowid = COALESCE(fts_matches.rowid, vec_matches.rowid)
        ${whereFilter}
        ORDER BY
          combined_rank DESC
        LIMIT ?
      )
      SELECT * FROM final;
    `;

    const rs = await this.client.execute({ sql, args });

    const results: SearchResult[] = rs.rows.map((row) => ({
      subject: String(row["item_id"]),
      predicate: String(row["property"]),
      object: String(row["value"]),
      score: Number(row["combined_rank"]),
    }));

    return { results };
  }
}
