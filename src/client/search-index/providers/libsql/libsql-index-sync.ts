import type { Client, InStatement } from "@libsql/client";
import type { Patch } from "#/client/quad-store/patch.ts";
import type { QuadChunker } from "#/client/search-index/chunking/quad-chunker.ts";
import { hashQuad } from "#/client/quad-store/hash.ts";
import type * as rdfjs from "@rdfjs/types";
import { Writer } from "n3";
import {
  buildDeleteByQuadIds,
  buildDeleteQuadsByQuadIds,
  buildInsertChunk,
  buildInsertQuad,
} from "./statements.ts";

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
 * LibsqlIndexSync manages global consistency between LibSQL persistent layers.
 * It simultaneously tracks the atomic master Fact records (quads) and derived Search indices (chunks).
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
   * sync atomically commits an arbitrary delta of additions and removals across all logical SQL indices.
   */
  public async sync(patch: Patch): Promise<void> {
    const statements: InStatement[] = [];

    // 1. Handle sweeping cleanup across BOTH logical storage bounds
    if (patch.deletions?.length) {
      const deletionQuadIds = await Promise.all(
        patch.deletions.map((q) => hashQuad(q)),
      );
      if (deletionQuadIds.length) {
        // Remove from derived search indices
        statements.push(buildDeleteByQuadIds(deletionQuadIds));
        // Remove from master fact table
        statements.push(buildDeleteQuadsByQuadIds(deletionQuadIds));
      }
    }

    // 2. Handle population and serialization of new additions
    if (patch.insertions?.length) {
      // First, archive atomic raw facts in the master tables
      for (const quad of patch.insertions) {
        const id = await hashQuad(quad);
        statements.push(
          buildInsertQuad({
            quad_id: id,
            subject: quad.subject.value,
            predicate: quad.predicate.value,
            object: quad.object.value,
            graph: quad.graph.value,
            nquad: serializeQuadToNQuad(quad),
          }),
        );
      }

      // Second, transform literals into chunked, vectorized artifacts for searching
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

    // Execute flush in a single ACID compliant optimized transaction batch
    if (statements.length > 0) {
      await this.client.batch(statements, "write");
    }
  }
}

/**
 * serializeQuadToNQuad produces rigid, standard N-Quads serialization strings.
 */
function serializeQuadToNQuad(quad: rdfjs.Quad): string {
  const writer = new Writer({ format: "N-Quads" });
  writer.addQuad(quad);
  let result = "";
  // Standard N3 writer executes end logic synchronously on buffered formats.
  writer.end((_err, str) => {
    result = str ?? "";
  });
  return result.trim();
}
