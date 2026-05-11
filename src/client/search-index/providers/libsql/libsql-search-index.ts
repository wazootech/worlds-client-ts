import type { Client, InStatement } from "@libsql/client";
import type {
  SearchIndexInterface,
  SearchRequest,
  SearchResponse,
  SearchResult,
} from "#/client/search-index/interface.ts";
import type { Patch, PatchHandler } from "#/client/quad-store/patch.ts";
import type { QuadChunker } from "#/client/search-index/chunking/quad-chunker.ts";
import { hashQuad } from "#/client/quad-store/hash.ts";
import {
  buildDeleteByFactIds,
  buildInsertChunk,
  buildSearchQuery,
} from "./statements.ts";

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
  /** Injected logic for breaking RDF strings into ingestible pieces. */
  chunker: QuadChunker;
  /** Optional page sizing constraints, defaults to 100. */
  limit?: number;
}

/**
 * LibsqlSearchIndex is an implementation of the SearchIndexInterface and PatchHandler
 * that uses an underlying LibSQL database to index, track deletions, and search the RDF store.
 *
 * It leverages the Reciprocal Rank Fusion (RRF) strategy to merge full-text search
 * relevance with vector semantic similarity.
 */
export class LibsqlSearchIndex implements SearchIndexInterface, PatchHandler {
  private readonly client: Client;
  private readonly embeddingService: EmbeddingService;
  private readonly chunker: QuadChunker;
  private readonly limit: number;

  constructor(options: LibsqlSearchIndexOptions) {
    this.client = options.client;
    this.embeddingService = options.embeddingService;
    this.chunker = options.chunker;
    this.limit = options.limit ?? 100;
  }

  /**
   * patch accepts an incremental stream of mutations and synchronizes the backend
   * database safely, batching cleanup and indexing operations efficiently.
   */
  public async patch(patches: Patch[]): Promise<void> {
    const statements: InStatement[] = [];

    for (const batch of patches) {
      // 1. Extract stable fact IDs from deletions and generate sweeping statements
      if (batch.deletions?.length) {
        const deletionFactIds = await Promise.all(
          batch.deletions.map((q) => hashQuad(q)),
        );
        if (deletionFactIds.length) {
          statements.push(buildDeleteByFactIds(deletionFactIds));
        }
      }

      // 2. Chunk insertions and transform each textual partition into actionable records
      if (batch.insertions?.length) {
        const chunks = await this.chunker.chunk(batch.insertions);
        for (const payload of chunks) {
          const vector = await this.embeddingService.embed(payload.value);
          const vectorJson = JSON.stringify(Array.from(vector));
          statements.push(
            buildInsertChunk({
              fact_id: payload.fact_id,
              subject: payload.subject,
              predicate: payload.predicate,
              value: payload.value,
              vectorJson,
            }),
          );
        }
      }
    }

    // Flush all batched updates within a single round-trip transaction if work exists.
    if (statements.length > 0) {
      await this.client.batch(statements, "write");
    }
  }

  /**
   * search executes a keyword and vector hybrid query against the current index.
   */
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
      text: String(row["value"]),
      score: Number(row["combined_rank"]),
    }));

    return { results };
  }
}
