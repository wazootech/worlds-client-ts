import type { Client } from "@libsql/client";
import { DataFactory } from "n3";
import type {
  SearchIndexInterface,
  SearchRequest,
  SearchResponse,
  SearchResult,
} from "../../search-index/mod.ts";
import { hashQuad } from "../../quad-store/mod.ts";
import type { LibsqlQueryBuilder } from "./libsql-query-builder.ts";
import type { EmbeddingService } from "../../search-index/embedding-service/mod.ts";

const { literal, namedNode, quad: createQuad, defaultGraph } = DataFactory;

/**
 * LibsqlSearchIndexOptions defines the structured configuration and dependency parameters needed to construct the LibSQL search engine.
 */
export interface LibsqlSearchIndexOptions {
  /** client is the initialized @libsql/client instance pointing to the target database. */
  client: Client;
  /** embeddingService is an optional capability for projecting textual search inputs into dense vector space. */
  embeddingService?: EmbeddingService;
  /** limit establishes optional page sizing constraints for search result sets, defaulting to 100. */
  limit?: number;

  /**
   * libsqlQueryBuilder must match the schema and commit path used when materializing chunk vectors.
   */
  libsqlQueryBuilder: LibsqlQueryBuilder;
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

    if (this.options.embeddingService) {
      try {
        const [vector] = await this.options.embeddingService.embed([
          request.query,
        ]);
        const embeddingLength = vector.length;
        if (
          embeddingLength !== this.options.libsqlQueryBuilder.vectorDimensions
        ) {
          throw new Error(
            `query embedding length ${embeddingLength} does not match vectorDimensions ${this.options.libsqlQueryBuilder.vectorDimensions}`,
          );
        }
        vectorJson = JSON.stringify(Array.from(vector));
      } catch (error) {
        // Gracefully degrade to keyword-only search if the embedding service fails.
        console.warn(
          `[Search Warning] Embedding service failure. Degrading to keyword-only search fallback. Reason: ${
            (error as Error).message
          }`,
        );
      }
    }

    const { sql, args } = this.options.libsqlQueryBuilder.buildSearchQuery(
      request,
      {
        vectorJson,
        limit: this.options.limit ?? 100,
      },
    );

    const resultSet = await this.options.client.execute({ sql, args });

    const results: SearchResult[] = [];

    for (const row of resultSet.rows) {
      const searchResultBase = {
        subject: String(row["subject"]),
        predicate: String(row["predicate"]),
        graph: String(row["graph"]),
        text: String(row["value"]),
      };
      const searchQuad = createQuad(
        namedNode(searchResultBase.subject),
        namedNode(searchResultBase.predicate),
        literal(searchResultBase.text),
        searchResultBase.graph
          ? namedNode(searchResultBase.graph)
          : defaultGraph(),
      );

      results.push({
        id: await hashQuad(searchQuad),
        ...searchResultBase,
        score: Number(row["combined_rank"]),
      });
    }

    return { results };
  }
}
