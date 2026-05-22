import type { Client, InStatement } from "@libsql/client";
import type {
  ChunkRowPayload,
  TextSplitterInterface,
} from "../../search-index/quad-chunker/mod.ts";
import { chunkQuads } from "../../search-index/quad-chunker/mod.ts";
import type * as rdfjs from "@rdfjs/types";
import type { Patch, QuadFilter } from "../../quad-store/mod.ts";
import { filterQuads, hashQuad } from "../../quad-store/mod.ts";
import type { LibsqlQueryBuilder } from "./libsql-query-builder.ts";
import type { EmbeddingService } from "../../search-index/embedding-service/mod.ts";

/**
 * CommitPatchToLibsqlOptions provides configurations for executing updates against LibSQL durable stores.
 */
export interface CommitPatchToLibsqlOptions {
  /** client is the underlying database connection. */
  client: Client;

  /** embeddingService is an optional projection capability for text literals, needed only if chunking requires new vector math. */
  embeddingService?: EmbeddingService;

  /** textSplitter is the splitting facility consumed when breaking large strings into search metadata. */
  textSplitter: TextSplitterInterface;

  /** maxLookupChunkSize specifies the maximum bound parameters per SQL statement for IN-clause lookups and deletions. Defaults to 800 (below SQLite SQLITE_MAX_VARIABLE_NUMBER). */
  maxLookupChunkSize?: number;

  /** maxWriteBatchSize caps how many statements are sent per LibSQL write batch. Defaults to 500. */
  maxWriteBatchSize?: number;

  /** quadFilter defines active synchronization inclusion bounds, facilitating hybrid partitioning where only specific facts are persisted. */
  quadFilter?: QuadFilter;

  /**
   * libsqlQueryBuilder supplies dimension-aware SQL used for deletions, inserts, and chunk replication.
   */
  libsqlQueryBuilder: LibsqlQueryBuilder;
}

/**
 * commitPatchToLibsql atomically commits an arbitrary delta of additions and removals across all logical SQL indices (quads and chunks).
 *
 * @param patch The set of proposed additions/removals extracted from the client store.
 * @param options Required durable handlers, search services and configurations.
 */
/** DEFAULT_MAX_LOOKUP_CHUNK_SIZE is the default IN-clause and deletion chunk width. */
const DEFAULT_MAX_LOOKUP_CHUNK_SIZE = 800;

/** DEFAULT_MAX_WRITE_BATCH_SIZE limits statements per LibSQL write batch. */
const DEFAULT_MAX_WRITE_BATCH_SIZE = 500;

export async function commitPatchToLibsql(
  patch: Patch,
  options: CommitPatchToLibsqlOptions,
): Promise<void> {
  const {
    client,
    maxLookupChunkSize,
    maxWriteBatchSize,
    quadFilter,
    libsqlQueryBuilder,
  } = options;
  const lookupChunkSize = maxLookupChunkSize ?? DEFAULT_MAX_LOOKUP_CHUNK_SIZE;
  const writeBatchSize = maxWriteBatchSize ?? DEFAULT_MAX_WRITE_BATCH_SIZE;
  const statements: InStatement[] = [];

  // ⚡ Performant Optimizations First: Compile pre-emptive filter gates to support lightning-fast memory partitioning
  const matcher = filterQuads(quadFilter);

  const targetedDeletions = patch.deletions?.filter(matcher) ?? [];
  const targetedInsertions = patch.insertions?.filter(matcher) ?? [];

  // 1. Stage Sweeping Deletion Operations
  const deletionQuadIds = new Set<string>();
  if (targetedDeletions.length) {
    const computedDeletionQuadIds = await computeQuadIds(targetedDeletions);
    for (const quadId of computedDeletionQuadIds) {
      deletionQuadIds.add(quadId);
    }
    if (computedDeletionQuadIds.length > 0) {
      statements.push(
        ...buildDeletionStatementsChunked(
          computedDeletionQuadIds,
          libsqlQueryBuilder,
          lookupChunkSize,
        ),
      );
    }
  }

  // 2. Stage Content-Addressed Novel Insertion Operations
  if (targetedInsertions.length) {
    const proposedQuadIds = await computeQuadIds(targetedInsertions);
    const existingIds = await queryCachePresence(
      client,
      proposedQuadIds,
      lookupChunkSize,
      libsqlQueryBuilder,
    );

    // Deduplication Filter: Process ONLY truly novel facts that are not yet persistent
    const novelInsertions: rdfjs.Quad[] = [];
    const novelQuadIds: string[] = [];
    for (let i = 0; i < targetedInsertions.length; i++) {
      const id = proposedQuadIds[i];
      if (!existingIds.has(id) || deletionQuadIds.has(id)) {
        novelInsertions.push(targetedInsertions[i]);
        novelQuadIds.push(id);
      }
    }

    if (novelQuadIds.length > 0) {
      // Ensure relational clean slate for new items
      statements.push(
        ...buildDeletionStatementsChunked(
          novelQuadIds,
          libsqlQueryBuilder,
          lookupChunkSize,
        ),
      );

      // Stage Fact Decompositions (Relational Index)
      statements.push(
        ...buildRelationalStatements(
          novelInsertions,
          novelQuadIds,
          libsqlQueryBuilder,
        ),
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

  // 3. Atomic ACID Transaction Execution (chunked to respect driver/SQLite limits)
  if (statements.length > 0) {
    try {
      await executeWriteBatches(client, statements, writeBatchSize);
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
function buildDeletionStatements(
  quadIds: string[],
  queryBuilder: LibsqlQueryBuilder,
): InStatement[] {
  return [
    queryBuilder.buildDeleteByQuadIds(quadIds),
    queryBuilder.buildDeleteQuadsByQuadIds(quadIds),
  ];
}

/**
 * buildDeletionStatementsChunked splits large quad id sets so each IN clause stays within SQLite variable limits.
 */
function buildDeletionStatementsChunked(
  quadIds: string[],
  queryBuilder: LibsqlQueryBuilder,
  chunkSize: number,
): InStatement[] {
  const statements: InStatement[] = [];
  for (let index = 0; index < quadIds.length; index += chunkSize) {
    const quadIdBatch = quadIds.slice(index, index + chunkSize);
    statements.push(...buildDeletionStatements(quadIdBatch, queryBuilder));
  }
  return statements;
}

/**
 * executeWriteBatches runs LibSQL write batches in fixed-size slices.
 */
async function executeWriteBatches(
  client: Client,
  statements: InStatement[],
  batchSize: number,
): Promise<void> {
  for (let index = 0; index < statements.length; index += batchSize) {
    const statementBatch = statements.slice(index, index + batchSize);
    await client.batch(statementBatch, "write");
  }
}

/**
 * queryCachePresence polls SQLite to check which Quad IDs have already been fully vectorized and indexed.
 */
async function queryCachePresence(
  client: Client,
  quadIds: string[],
  lookupChunkSize: number,
  queryBuilder: LibsqlQueryBuilder,
): Promise<Set<string>> {
  const cachedIds = new Set<string>();
  try {
    for (let i = 0; i < quadIds.length; i += lookupChunkSize) {
      const batchIds = quadIds.slice(i, i + lookupChunkSize);
      const query = queryBuilder.buildSelectExistingQuadIds(batchIds);
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
  queryBuilder: LibsqlQueryBuilder,
): InStatement[] {
  const statements: InStatement[] = [];
  for (let i = 0; i < quads.length; i++) {
    const quad = quads[i];
    const id = quadIds[i];

    // Decompose literal nodes explicitly to capture type & lang tags
    const isLiteral = quad.object.termType === "Literal";
    const literal = isLiteral ? (quad.object as rdfjs.Literal) : null;

    statements.push(
      queryBuilder.buildInsertQuad({
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

  // Step B: Execute Deduplicated External Embedding Sweep (if service available)
  let uniqueVectors: Array<Float32Array | number[]> | undefined;
  let vectorLookupMap: Map<string, Float32Array | number[]> | undefined;

  if (options.embeddingService) {
    const uniqueTexts = Array.from(new Set(chunks.map((c) => c.value)));
    try {
      uniqueVectors = await options.embeddingService.embed(uniqueTexts);
      for (
        let vectorIndex = 0;
        vectorIndex < uniqueVectors.length;
        vectorIndex++
      ) {
        const projectedVector = uniqueVectors[vectorIndex]!;
        const embeddingLength = projectedVector.length;
        if (embeddingLength !== options.libsqlQueryBuilder.vectorDimensions) {
          throw new Error(
            `embedding length ${embeddingLength} does not match configured vectorDimensions ${options.libsqlQueryBuilder.vectorDimensions}`,
          );
        }
      }
    } catch (cause) {
      throw new Error("failed to vectorize literal chunk blocks", { cause });
    }

    // Step C: Synthesize lookup mapping back to original source payloads
    vectorLookupMap = new Map<string, Float32Array | number[]>();
    for (let textIndex = 0; textIndex < uniqueTexts.length; textIndex++) {
      vectorLookupMap.set(uniqueTexts[textIndex], uniqueVectors[textIndex]!);
    }
  }

  // Step D: Generate relational chunk insertions with optional JSON vector projections
  for (const payload of chunks) {
    const vector = vectorLookupMap?.get(payload.value);
    const vectorJson = vector ? JSON.stringify(Array.from(vector)) : undefined;

    statements.push(
      options.libsqlQueryBuilder.buildInsertChunk({
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
