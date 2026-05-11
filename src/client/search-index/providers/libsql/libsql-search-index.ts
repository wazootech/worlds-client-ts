import type { Client } from "@libsql/client";
import type {
  SearchIndexInterface,
  SearchRequest,
  SearchResponse,
  SearchResult,
} from "#/client/search-index/interface.ts";
import { buildSearchQuery } from "./statements.ts";

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

    const { sql, args } = buildSearchQuery(request, {
      vectorJson,
      limit: this.limit,
    });

    const rs = await this.client.execute({ sql, args });

    const results: SearchResult[] = rs.rows.map((row) => ({
      subject: String(row["subject"]),
      predicate: String(row["predicate"]),
      object: String(row["value"]),
      score: Number(row["combined_rank"]),
    }));

    return { results };
  }
}
