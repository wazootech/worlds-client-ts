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

    // ⚡ Performant Cache Guard: Check which incoming Quad IDs are ALREADY resident in SQLite
    const existingIds = new Set<string>();
    try {
      // Defensively chunk lookup queries to respect typical SQLite bound parameter limits
      const lookupChunkSize = 900;
      for (let i = 0; i < quadIds.length; i += lookupChunkSize) {
        const batchIds = quadIds.slice(i, i + lookupChunkSize);
        const query = LibsqlQueryBuilder.buildSelectExistingQuadIds(batchIds);
        const resultSet = await client.execute(query);
        for (const row of resultSet.rows) {
          if (row.id) {
            existingIds.add(String(row.id));
          }
        }
      }
    } catch (cause) {
      throw new Error("failed to query existing cache state", { cause });
    }

    // Content-Addressed Deduplication: Process ONLY truly novel facts that require computation
    const novelInsertions: rdfjs.Quad[] = [];
    const novelQuadIds: string[] = [];
    for (let i = 0; i < patch.insertions.length; i++) {
      const id = quadIds[i];
      if (!existingIds.has(id)) {
        novelInsertions.push(patch.insertions[i]);
        novelQuadIds.push(id);
      }
    }

    if (novelQuadIds.length > 0) {
      // Ensure absolute relational clean slate for the novel items
      statements.push(LibsqlQueryBuilder.buildDeleteByQuadIds(novelQuadIds));
      statements.push(
        LibsqlQueryBuilder.buildDeleteQuadsByQuadIds(novelQuadIds),
      );

      // First, directly archive facts natively decomposing structures into relational columns
      for (let i = 0; i < novelInsertions.length; i++) {
        const quad = novelInsertions[i];
        const id = novelQuadIds[i];

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
        chunks = await chunkQuads(novelInsertions, textSplitter, novelQuadIds);
      } catch (cause) {
        throw new Error("failed to chunk insertions", { cause });
      }

      if (chunks.length > 0) {
        // Performance Optimization: Strictly deduplicate identical texts across the novel batch
        const uniqueTexts = Array.from(new Set(chunks.map((c) => c.value)));

        let uniqueVectors: Array<Float32Array | number[]>;
        try {
          uniqueVectors = await embeddingService.embed(uniqueTexts);
        } catch (cause) {
          throw new Error("failed to embed chunk batch", { cause });
        }

        // Synthesize lookup cache for distribution back to individual chunks
        const vectorLookupMap = new Map<string, Float32Array | number[]>();
        for (let i = 0; i < uniqueTexts.length; i++) {
          vectorLookupMap.set(uniqueTexts[i], uniqueVectors[i]);
        }

        for (const payload of chunks) {
          const vector = vectorLookupMap.get(payload.value);
          if (!vector) continue; // Defensive guarantee
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
