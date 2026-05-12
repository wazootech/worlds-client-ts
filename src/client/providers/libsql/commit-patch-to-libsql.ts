import type { Client, InStatement } from "@libsql/client";
import type { Patch } from "#/client/quad-store/patch.ts";
import type {
  ChunkRowPayload,
  TextSplitterInterface,
} from "#/client/search-index/quad-chunker/chunk-quads.ts";
import { chunkQuads } from "#/client/search-index/quad-chunker/chunk-quads.ts";
import { hashQuad } from "#/client/quad-store/hash-quad.ts";
import type * as rdfjs from "@rdfjs/types";
import { LibsqlQueryBuilder } from "./libsql-query-builder.ts";
import type { EmbeddingService } from "#/client/search-index/embedding-service/mod.ts";

/**
 * CommitPatchToLibsqlOptions provides configurations for executing updates against LibSQL durable stores.
 */
export interface CommitPatchToLibsqlOptions {
  /** client is the underlying database connection. */
  client: Client;

  /** embeddingService is an optional projection capability for text literals, needed only if chunking requires new vector math. */
  embeddingService: EmbeddingService;

  /** textSplitter is the splitting facility consumed when breaking large strings into search metadata. */
  textSplitter: TextSplitterInterface;
}

/**
 * commitPatchToLibsql atomically commits an arbitrary delta of additions and removals across all logical SQL indices (quads and chunks).
 *
 * @param patch The set of proposed additions/removals extracted from the client store.
 * @param options Required durable handlers, search services and configurations.
 */
export async function commitPatchToLibsql(
  patch: Patch,
  options: CommitPatchToLibsqlOptions,
): Promise<void> {
  const statements: InStatement[] = [];
  const { client, embeddingService, textSplitter } = options;

  // 1. Handle sweeping cleanup across BOTH logical storage bounds
  if (patch.deletions?.length) {
    let deletionQuadIds: string[];
    try {
      deletionQuadIds = await Promise.all(
        patch.deletions.map((q) => hashQuad(q)),
      );
    } catch (cause) {
      throw new Error("failed to hash deletion quads", { cause });
    }
    if (deletionQuadIds.length) {
      statements.push(LibsqlQueryBuilder.buildDeleteByQuadIds(deletionQuadIds));
      statements.push(
        LibsqlQueryBuilder.buildDeleteQuadsByQuadIds(deletionQuadIds),
      );
    }
  }

  // 2. Handle population and serialization of new additions
  if (patch.insertions?.length) {
    // Batch-hash all quads upfront to avoid redundant canonization
    let quadIds: string[];
    try {
      quadIds = await Promise.all(
        patch.insertions.map((q) => hashQuad(q)),
      );
    } catch (cause) {
      throw new Error("failed to hash insertion quads", { cause });
    }

    // Pre-emptive Cleaning: Ensure absolute relational idempotence by clearing existing records
    // for incoming Quad IDs prior to re-insertion. This defends against cross-application
    // collision and stale state pollution.
    statements.push(LibsqlQueryBuilder.buildDeleteByQuadIds(quadIds));
    statements.push(LibsqlQueryBuilder.buildDeleteQuadsByQuadIds(quadIds));

    // First, directly archive facts natively decomposing structures into relational columns
    for (let i = 0; i < patch.insertions.length; i++) {
      const quad = patch.insertions[i];
      const id = quadIds[i];

      // Conditional typing extractors for Literal specific properties
      const isLiteral = quad.object.termType === "Literal";
      const literal = isLiteral ? (quad.object as rdfjs.Literal) : null;

      statements.push(
        LibsqlQueryBuilder.buildInsertQuad({
          quad_id: id,
          s: quad.subject.value,
          s_type: quad.subject.termType,
          p: quad.predicate.value,
          o: quad.object.value,
          o_type: quad.object.termType,
          o_datatype: literal?.datatype?.value,
          o_lang: literal?.language,
          g: quad.graph.value,
          g_type: quad.graph.termType,
        }),
      );
    }

    // Second, transform literals into chunked, vectorized artifacts for searching
    let chunks: ChunkRowPayload[];
    try {
      // Consume functional chunker directly
      chunks = await chunkQuads(patch.insertions, textSplitter, quadIds);
    } catch (cause) {
      throw new Error("failed to chunk insertions", { cause });
    }
    if (chunks.length > 0) {
      // Supercharged Batch Optimization: Fetch all embeddings in exactly one unified request!
      let vectors: Array<Float32Array | number[]>;
      try {
        const texts = chunks.map((c) => c.value);
        vectors = await embeddingService.embed(texts);
      } catch (cause) {
        throw new Error("failed to embed chunk batch", { cause });
      }

      for (let i = 0; i < chunks.length; i++) {
        const payload = chunks[i];
        const vector = vectors[i];
        const vectorJson = JSON.stringify(Array.from(vector));

        statements.push(
          LibsqlQueryBuilder.buildInsertChunk({
            quad_id: payload.quad_id,
            subject: payload.subject,
            predicate: payload.predicate,
            graph: payload.graph,
            value: payload.value,
            vectorJson,
          }),
        );
      }
    }
  }

  // Execute flush in a single ACID compliant optimized transaction batch
  if (statements.length > 0) {
    try {
      await client.batch(statements, "write");
    } catch (cause) {
      throw new Error("failed to execute sync batch", { cause });
    }
  }
}
