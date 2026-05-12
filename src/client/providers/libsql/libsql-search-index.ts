import type { Client } from "@libsql/client";
import type {
  SearchIndexInterface,
  SearchRequest,
  SearchResponse,
  SearchResult,
} from "#/client/search-index/search-index-interface.ts";
import { buildSearchQuery } from "./statements.ts";

import type { EmbeddingService } from "#/client/search-index/embedding-service/mod.ts";

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
 * LibsqlSearchIndex implements only the query pathway, performing sub-millisecond hybrid search.
 */
export class LibsqlSearchIndex implements SearchIndexInterface {
  public constructor(
    private readonly options: LibsqlSearchIndexOptions,
  ) {}

  /**
   * search executes a keyword and vector hybrid query against the current index.
   */
  public async search(request: SearchRequest): Promise<SearchResponse> {
    let vectorJson: string | undefined;

    try {
      const vector = await this.options.embeddingService.embed(request.query);
      vectorJson = JSON.stringify(Array.from(vector));
    } catch (error) {
      // Gracefully degrade to keyword-only search if the embedding provider fails.
      console.warn(
        `[Search Warning] Embedding service failure. Degrading to keyword-only search fallback. Reason: ${
          (error as Error).message
        }`,
      );
    }

    const { sql, args } = buildSearchQuery(request, {
      vectorJson,
      limit: this.options.limit ?? 100,
    });

    const resultSet = await this.options.client.execute({ sql, args });

    const results: SearchResult[] = resultSet.rows.map((row) => ({
      subject: String(row["subject"]),
      predicate: String(row["predicate"]),
      graph: String(row["graph"]),
      text: String(row["value"]),
      score: Number(row["combined_rank"]),
    }));

    return { results };
  }
}
