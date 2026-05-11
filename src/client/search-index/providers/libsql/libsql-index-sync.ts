import type { Client, InStatement } from "@libsql/client";
import type { Patch } from "#/client/quad-store/patch.ts";
import type { QuadChunker } from "#/client/search-index/chunking/quad-chunker.ts";
import { hashQuad } from "#/client/quad-store/hash.ts";
import type * as rdfjs from "@rdfjs/types";
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
        statements.push(buildDeleteByQuadIds(deletionQuadIds));
        statements.push(buildDeleteQuadsByQuadIds(deletionQuadIds));
      }
    }

    // 2. Handle population and serialization of new additions
    if (patch.insertions?.length) {
      // First, directly archive facts natively decomposing structures into relational columns
      for (const quad of patch.insertions) {
        const id = await hashQuad(quad);

        // Conditional typing extractors for Literal specific properties
        const isLit = quad.object.termType === "Literal";
        const lit = isLit ? (quad.object as rdfjs.Literal) : null;

        statements.push(
          buildInsertQuad({
            quad_id: id,
            s: quad.subject.value,
            s_type: quad.subject.termType,
            p: quad.predicate.value,
            o: quad.object.value,
            o_type: quad.object.termType,
            o_datatype: lit?.datatype?.value,
            o_lang: lit?.language,
            g: quad.graph.value,
            g_type: quad.graph.termType,
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
