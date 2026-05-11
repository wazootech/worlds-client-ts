import type { Client, InStatement } from "@libsql/client";
import type { Patch } from "#/client/quad-store/patch.ts";
import type { QuadChunker } from "#/client/search-index/chunking/quad-chunker.ts";
import { hashQuad } from "#/client/quad-store/hash.ts";
import { buildDeleteByQuadIds, buildInsertChunk } from "./statements.ts";

/**
 * EmbeddingService describes an external interface used to generate vectors from text.
 */
export interface EmbeddingService {
  embed(text: string): Promise<Float32Array | number[]>;
}

/**
 * Configuration required by the Synchronizer to update the index.
 */
export interface LibsqlIndexSyncOptions {
  /** The underlying database connection. */
  client: Client;
  /** The utility splitting big literal strings into vectors. */
  chunker: QuadChunker;
  /** Projection capability required to generate chunk vectors. */
  embeddingService: EmbeddingService;
}

/**
 * LibsqlIndexSync isolates the responsibility of mutating the vector search index.
 * It converts Quad patches into vectorized chunk rows and commits them atomically.
 */
export class LibsqlIndexSync {
  private readonly client: Client;
  private readonly chunker: QuadChunker;
  private readonly embeddingService: EmbeddingService;

  constructor(options: LibsqlIndexSyncOptions) {
    this.client = options.client;
    this.chunker = options.chunker;
    this.embeddingService = options.embeddingService;
  }

  /**
   * sync consumes transactional Quad patches and updates the LibSQL storage layout.
   * Note: This is designed to be directly plugged into the RdfjsQuadStore patch listener array.
   */
  public async sync(patch: Patch): Promise<void> {
    const statements: InStatement[] = [];

    // 1. Handle sweeping cleanup for stale/overwritten data
    if (patch.deletions?.length) {
      const deletionQuadIds = await Promise.all(
        patch.deletions.map((q) => hashQuad(q)),
      );
      if (deletionQuadIds.length) {
        statements.push(buildDeleteByQuadIds(deletionQuadIds));
      }
    }

    // 2. Handle chunking and vector ingestion for incoming additions
    if (patch.insertions?.length) {
      const chunks = await this.chunker.chunk(patch.insertions);
      for (const payload of chunks) {
        const vector = await this.embeddingService.embed(payload.value);
        const vectorJson = JSON.stringify(Array.from(vector));
        statements.push(
          buildInsertChunk({
            quad_id: payload.quad_id,
            subject: payload.subject,
            predicate: payload.predicate,
            value: payload.value,
            vectorJson,
          }),
        );
      }
    }

    // Execute flush in a single optimized transaction if work is queued
    if (statements.length > 0) {
      await this.client.batch(statements, "write");
    }
  }
}
