import type { Client, InStatement } from "@libsql/client";
import type { Patch } from "#/client/quad-store/patch.ts";
import type {
  ChunkRowPayload,
  TextSplitterInterface,
} from "#/client/search-index/quad-chunker/chunk-quads.ts";
import { chunkQuads } from "#/client/search-index/quad-chunker/chunk-quads.ts";
import { hashQuad } from "#/client/quad-store/hash-quad.ts";
import type * as rdfjs from "@rdfjs/types";
import {
  filterQuads,
  type QuadFilter,
} from "#/client/quad-store/quad-filter.ts";
import { libsqlQueryBuilder } from "./libsql-query-builder.ts";
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

  /** maxLookupChunkSize specifies the batch size threshold used to chunk long IN queries, preventing parameter overflow crashes. Defaults to a conservative 800 (accounting for historical SQLite 999 SQLITE_MAX_VARIABLE_NUMBER cap with headroom). */
  maxLookupChunkSize?: number;

  /** quadFilter defines active synchronization inclusion bounds, facilitating hybrid partitioning where only specific facts are persisted. */
  quadFilter?: QuadFilter;
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
  const { client, maxLookupChunkSize, quadFilter } = options;
  const statements: InStatement[] = [];

  // ⚡ Performant Optimizations First: Compile pre-emptive filter gates to support lightning-fast memory partitioning
  const matcher = filterQuads(quadFilter);

  const targetedDeletions = patch.deletions?.filter(matcher) ?? [];
  const targetedInsertions = patch.insertions?.filter(matcher) ?? [];

  // 1. Stage Sweeping Deletion Operations
  if (targetedDeletions.length) {
    const deletionQuadIds = await computeQuadIds(targetedDeletions);
    if (deletionQuadIds.length > 0) {
      statements.push(...buildDeletionStatements(deletionQuadIds));
    }
  }

  // 2. Stage Content-Addressed Novel Insertion Operations
  if (targetedInsertions.length) {
    const proposedQuadIds = await computeQuadIds(targetedInsertions);
    const existingIds = await queryCachePresence(
      client,
      proposedQuadIds,
      maxLookupChunkSize,
    );

    // Deduplication Filter: Process ONLY truly novel facts that are not yet persistent
    const novelInsertions: rdfjs.Quad[] = [];
    const novelQuadIds: string[] = [];
    for (let i = 0; i < targetedInsertions.length; i++) {
      const id = proposedQuadIds[i];
      if (!existingIds.has(id)) {
        novelInsertions.push(targetedInsertions[i]);
        novelQuadIds.push(id);
      }
    }

    if (novelQuadIds.length > 0) {
      // Ensure relational clean slate for new items
      statements.push(...buildDeletionStatements(novelQuadIds));

      // Stage Fact Decompositions (Relational Index)
      statements.push(
        ...buildRelationalStatements(novelInsertions, novelQuadIds),
      );

      // Stage Projected Literals (Semantic/FTS Index)
      const chunkStatements = await buildVectorChunkStatements(
        novelInsertions,
        novelQuadIds,
        options,
      );
      statements.push(...chunkStatements);
    }
  }

  // 3. Atomic ACID Transaction Execution
  if (statements.length > 0) {
    try {
      await client.batch(statements, "write");
    } catch (cause) {
      throw new Error("failed to execute sync batch", { cause });
    }
  }
}

// ==========================================
// PRIVATE REVOLVING PIPELINE HELPERS
// ==========================================

/**
 * computeQuadIds computes deterministic base64 URL-safe content hashes for raw Graph quads.
 */
async function computeQuadIds(quads: rdfjs.Quad[]): Promise<string[]> {
  try {
    return await Promise.all(quads.map((q) => hashQuad(q)));
  } catch (cause) {
    throw new Error("failed to compute content hashes for incoming quads", {
      cause,
    });
  }
}

/**
 * buildDeletionStatements constructs parameterized deletion statements sweeping facts and vector bounds.
 */
function buildDeletionStatements(quadIds: string[]): InStatement[] {
  return [
    libsqlQueryBuilder.buildDeleteByQuadIds(quadIds),
    libsqlQueryBuilder.buildDeleteQuadsByQuadIds(quadIds),
  ];
}

/**
 * queryCachePresence polls SQLite to check which Quad IDs have already been fully vectorized and indexed.
 */
async function queryCachePresence(
  client: Client,
  quadIds: string[],
  maxLookupChunkSize?: number,
): Promise<Set<string>> {
  const cachedIds = new Set<string>();
  try {
    // Defensively chunk lookup queries to respect SQLite's default cap of 999 bound variables (SQLITE_MAX_VARIABLE_NUMBER).
    // Defaulting to 800 provides nearly 100% of batch performance gains while preserving ~200 variable slots for supplemental criteria.
    const lookupChunkSize = maxLookupChunkSize ?? 800;
    for (let i = 0; i < quadIds.length; i += lookupChunkSize) {
      const batchIds = quadIds.slice(i, i + lookupChunkSize);
      const query = libsqlQueryBuilder.buildSelectExistingQuadIds(batchIds);
      const resultSet = await client.execute(query);
      for (const row of resultSet.rows) {
        if (row.id) {
          cachedIds.add(String(row.id));
        }
      }
    }
  } catch (cause) {
    throw new Error("failed to query existing cache state", { cause });
  }

  return cachedIds;
}

/**
 * buildRelationalStatements decomposes structured Triples into raw SQLite relational columns.
 */
function buildRelationalStatements(
  quads: rdfjs.Quad[],
  quadIds: string[],
): InStatement[] {
  const statements: InStatement[] = [];
  for (let i = 0; i < quads.length; i++) {
    const quad = quads[i];
    const id = quadIds[i];

    // Decompose literal nodes explicitly to capture type & lang tags
    const isLiteral = quad.object.termType === "Literal";
    const literal = isLiteral ? (quad.object as rdfjs.Literal) : null;

    statements.push(
      libsqlQueryBuilder.buildInsertQuad({
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
  return statements;
}

/**
 * buildVectorChunkStatements decomposes, chunks, and embeds textual facts, producing projected SQL inserts.
 */
async function buildVectorChunkStatements(
  quads: rdfjs.Quad[],
  quadIds: string[],
  options: CommitPatchToLibsqlOptions,
): Promise<InStatement[]> {
  const statements: InStatement[] = [];

  // Step A: Chunks string literals based on splitting strategy
  let chunks: ChunkRowPayload[];
  try {
    chunks = await chunkQuads(quads, options.textSplitter, quadIds);
  } catch (cause) {
    throw new Error("failed to chunk novel textual facts", { cause });
  }

  if (chunks.length === 0) {
    return [];
  }

  // Step B: Execute Deduplicated External Embedding Sweep
  const uniqueTexts = Array.from(new Set(chunks.map((c) => c.value)));
  let uniqueVectors: Array<Float32Array | number[]>;
  try {
    uniqueVectors = await options.embeddingService.embed(uniqueTexts);
  } catch (cause) {
    throw new Error("failed to vectorize literal chunk blocks", { cause });
  }

  // Step C: Synthesize lookup mapping back to original source payloads
  const vectorLookupMap = new Map<string, Float32Array | number[]>();
  for (let i = 0; i < uniqueTexts.length; i++) {
    vectorLookupMap.set(uniqueTexts[i], uniqueVectors[i]);
  }

  // Step D: Generate relational chunk insertions with embedded JSON vector projections
  for (const payload of chunks) {
    const vector = vectorLookupMap.get(payload.value);
    if (!vector) continue; // Defensive safety guard
    const vectorJson = JSON.stringify(Array.from(vector));

    statements.push(
      libsqlQueryBuilder.buildInsertChunk({
        quad_id: payload.quad_id,
        subject: payload.subject,
        predicate: payload.predicate,
        graph: payload.graph,
        value: payload.value,
        vectorJson,
      }),
    );
  }

  return statements;
}
