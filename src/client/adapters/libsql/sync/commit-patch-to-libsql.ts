import type { Client, InStatement } from "@libsql/client";
import type {
  ChunkRowPayload,
  TextSplitterInterface,
} from "@/client/search-index/quad-chunker/mod.ts";
import { chunkQuads } from "@/client/search-index/quad-chunker/mod.ts";
import type * as rdfjs from "@rdfjs/types";
import type { Patch } from "@/client/quad-store/mod.ts";
import {
  filterQuads,
  hashQuads,
  isTextualLiteral,
} from "@/client/quad-store/mod.ts";
import type { LibsqlClientBaseOptions } from "@/client/adapters/libsql/libsql-client-base-options.ts";
import type { LibsqlQueryBuilder } from "@/client/adapters/libsql/libsql-query-builder.ts";
import { quadFromLibsqlRow } from "@/client/adapters/libsql/libsql-quad-row.ts";
import {
  buildChunkFtsValue,
  resolveLabelPredicates,
} from "@/client/adapters/libsql/search/search-chunk-fts.ts";

/**
 * CommitPatchToLibsqlOptions provides configurations for executing updates against LibSQL durable stores.
 */
export interface CommitPatchToLibsqlOptions extends LibsqlClientBaseOptions {
  /** textSplitter is the splitting facility consumed when breaking large strings into search metadata. */
  textSplitter: TextSplitterInterface;

  /** maxWriteBatchSize caps how many statements are sent per LibSQL write batch. Defaults to 500. */
  maxWriteBatchSize?: number;

  /** libsqlQueryBuilder supplies dimension-aware SQL used for deletions, inserts, and chunk replication. */
  libsqlQueryBuilder: LibsqlQueryBuilder;

  /** skipSearchIndexProjection omits FTS/vector chunk writes for this patch (quads table only). Pair with `rebuildLibsqlSearchIndexFromQuads` after bulk import when searchIndexOnImport is "deferred". */
  skipSearchIndexProjection?: boolean;
}

/**
 * RefreshSearchChunksForSubjectsResult reports subject-scoped search index refresh counts.
 */
export interface RefreshSearchChunksForSubjectsResult {
  /** subjectCount is the number of distinct subject IRIs refreshed. */
  subjectCount: number;
  /** chunkRowCount is the number of chunk rows written. */
  chunkRowCount: number;
}

/** DEFAULT_MAX_LOOKUP_CHUNK_SIZE is the default IN-clause and deletion chunk width. */
const DEFAULT_MAX_LOOKUP_CHUNK_SIZE = 800;

/** DEFAULT_MAX_WRITE_BATCH_SIZE limits statements per LibSQL write batch. */
const DEFAULT_MAX_WRITE_BATCH_SIZE = 500;

/** STAGING_FLUSH_THRESHOLD flushes staged SQL during large commits to avoid huge in-memory arrays. */
const STAGING_FLUSH_THRESHOLD = 10_000;

/**
 * appendInStatements appends statements without spread (large patches overflow the call stack).
 */
function appendInStatements(
  target: InStatement[],
  source: readonly InStatement[],
): void {
  const sourceLength = source.length;
  for (let index = 0; index < sourceLength; index++) {
    target.push(source[index]!);
  }
}

/**
 * flushStagedStatements executes and clears staged write statements when the threshold is reached.
 */
async function flushStagedStatements(
  client: Client,
  statements: InStatement[],
  writeBatchSize: number,
): Promise<void> {
  if (statements.length === 0) {
    return;
  }
  await executeWriteBatches(client, statements, writeBatchSize);
  statements.length = 0;
}

/**
 * stageInStatements appends statements and flushes when the staging buffer grows too large.
 */
async function stageInStatements(
  client: Client,
  statements: InStatement[],
  source: readonly InStatement[],
  writeBatchSize: number,
): Promise<void> {
  appendInStatements(statements, source);
  if (statements.length >= STAGING_FLUSH_THRESHOLD) {
    await flushStagedStatements(client, statements, writeBatchSize);
  }
}

/**
 * commitPatchToLibsql commits additions and removals across LibSQL quads and optional search chunks.
 *
 * Large patches are written in multiple `client.batch` slices (see `STAGING_FLUSH_THRESHOLD`) to avoid
 * stack overflow and bound peak memory; that is chunked durability, not one atomic SQL transaction across
 * the entire patch. Use `searchIndexOnImport: "deferred"` on the LibSQL factory plus `rebuildLibsqlSearchIndexFromQuads`
 * when bulk loading millions of quads.
 */
export async function commitPatchToLibsql(
  patch: Patch,
  options: CommitPatchToLibsqlOptions,
): Promise<void> {
  const {
    client,
    maxLookupChunkSize,
    maxWriteBatchSize,
    include,
    exclude,
    libsqlQueryBuilder,
  } = options;
  const lookupChunkSize = maxLookupChunkSize ?? DEFAULT_MAX_LOOKUP_CHUNK_SIZE;
  const writeBatchSize = maxWriteBatchSize ?? DEFAULT_MAX_WRITE_BATCH_SIZE;
  const resolvedLabelPredicates = resolveLabelPredicates(
    options.labelPredicates,
  );
  const statements: InStatement[] = [];

  const matcher = filterQuads({ include, exclude });

  const targetedDeletions = patch.deletions?.filter(matcher) ?? [];
  const targetedInsertions = patch.insertions?.filter(matcher) ?? [];

  // 1. Stage Sweeping Deletion Operations
  const deletionQuadIds = new Set<string>();
  if (targetedDeletions.length) {
    const computedDeletionQuadIds = await hashQuads(targetedDeletions);
    for (const quadId of computedDeletionQuadIds) {
      deletionQuadIds.add(quadId);
    }
    if (computedDeletionQuadIds.length > 0) {
      await stageInStatements(
        client,
        statements,
        buildDeletionStatementsChunked(
          computedDeletionQuadIds,
          libsqlQueryBuilder,
          lookupChunkSize,
        ),
        writeBatchSize,
      );
    }
  }

  // 2. Stage Content-Addressed Novel Insertion Operations
  if (targetedInsertions.length) {
    const proposedQuadIds = await hashQuads(targetedInsertions);
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
      await stageInStatements(
        client,
        statements,
        buildDeletionStatementsChunked(
          novelQuadIds,
          libsqlQueryBuilder,
          lookupChunkSize,
        ),
        writeBatchSize,
      );

      // Stage Fact Decompositions (Relational Index)
      await stageInStatements(
        client,
        statements,
        buildRelationalStatements(
          novelInsertions,
          novelQuadIds,
          libsqlQueryBuilder,
        ),
        writeBatchSize,
      );

      // Stage Projected Literals (Semantic/FTS Index)
      if (!options.skipSearchIndexProjection) {
        const chunkStatements = await buildVectorChunkStatements(
          novelInsertions,
          novelQuadIds,
          options,
          resolvedLabelPredicates,
        );
        await stageInStatements(
          client,
          statements,
          chunkStatements,
          writeBatchSize,
        );
      }
    }
  }

  // 3. Flush any remaining staged writes (chunked to respect driver/SQLite limits)
  if (statements.length > 0) {
    try {
      await flushStagedStatements(client, statements, writeBatchSize);
    } catch (cause) {
      throw new Error("failed to execute sync batch", { cause });
    }
  }

  const labelTouchedSubjects = collectLabelPredicateSubjects(
    targetedInsertions,
    targetedDeletions,
    resolvedLabelPredicates,
  );
  if (
    labelTouchedSubjects.length > 0 &&
    !options.skipSearchIndexProjection
  ) {
    await refreshSearchChunksForSubjects(labelTouchedSubjects, options);
  }
}

/**
 * refreshSearchChunksForQuads deletes existing chunk rows for the given quads and rebuilds FTS/vector projections.
 *
 * Durable `quads` rows are not modified. Returns the number of chunk rows written.
 */
export async function refreshSearchChunksForQuads(
  quads: rdfjs.Quad[],
  options: CommitPatchToLibsqlOptions,
): Promise<number> {
  if (quads.length === 0) {
    return 0;
  }

  const lookupChunkSize = options.maxLookupChunkSize ??
    DEFAULT_MAX_LOOKUP_CHUNK_SIZE;
  const writeBatchSize = options.maxWriteBatchSize ??
    DEFAULT_MAX_WRITE_BATCH_SIZE;
  const resolvedLabelPredicates = resolveLabelPredicates(
    options.labelPredicates,
  );

  const quadIds = await hashQuads(quads);
  const chunkInsertStatements = await buildVectorChunkStatements(
    quads,
    quadIds,
    options,
    resolvedLabelPredicates,
  );
  const statements: InStatement[] = [];
  appendInStatements(
    statements,
    buildChunkDeletionStatementsChunked(
      quadIds,
      options.libsqlQueryBuilder,
      lookupChunkSize,
    ),
  );
  appendInStatements(statements, chunkInsertStatements);

  if (statements.length === 0) {
    return 0;
  }

  try {
    await flushStagedStatements(options.client, statements, writeBatchSize);
  } catch (cause) {
    throw new Error("failed to refresh search chunks", { cause });
  }

  return chunkInsertStatements.length;
}

/**
 * refreshSearchChunksForSubjects rebuilds FTS/vector rows for all textual-literal quads of the given subjects.
 */
export async function refreshSearchChunksForSubjects(
  subjects: string[],
  options: CommitPatchToLibsqlOptions,
): Promise<RefreshSearchChunksForSubjectsResult> {
  const uniqueSubjects = Array.from(new Set(subjects));
  if (uniqueSubjects.length === 0) {
    return { subjectCount: 0, chunkRowCount: 0 };
  }

  const lookupChunkSize = options.maxLookupChunkSize ??
    DEFAULT_MAX_LOOKUP_CHUNK_SIZE;
  const quads: rdfjs.Quad[] = [];

  for (let index = 0; index < uniqueSubjects.length; index += lookupChunkSize) {
    const subjectBatch = uniqueSubjects.slice(index, index + lookupChunkSize);
    const query = options.libsqlQueryBuilder
      .buildSelectTextualLiteralQuadsForSubjects(subjectBatch);
    const resultSet = await options.client.execute(query);
    for (const row of resultSet.rows) {
      try {
        const reconstructedQuad = quadFromLibsqlRow(row);
        if (isTextualLiteral(reconstructedQuad.object)) {
          quads.push(reconstructedQuad);
        }
      } catch (cause) {
        throw new Error("failed to load textual quads for subject refresh", {
          cause,
        });
      }
    }
  }

  const chunkRowCount = await refreshSearchChunksForQuads(quads, options);
  return {
    subjectCount: uniqueSubjects.length,
    chunkRowCount,
  };
}

/**
 * collectLabelPredicateSubjects returns subject IRIs touched by label-predicate quad mutations.
 */
function collectLabelPredicateSubjects(
  insertions: rdfjs.Quad[],
  deletions: rdfjs.Quad[],
  labelPredicates: string[],
): string[] {
  const labelPredicateSet = new Set(labelPredicates);
  const subjects = new Set<string>();
  for (const quad of [...insertions, ...deletions]) {
    if (labelPredicateSet.has(quad.predicate.value)) {
      subjects.add(quad.subject.value);
    }
  }
  return Array.from(subjects);
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
    appendInStatements(
      statements,
      buildDeletionStatements(quadIdBatch, queryBuilder),
    );
  }
  return statements;
}

/**
 * buildChunkDeletionStatementsChunked deletes only search chunk rows for the given quad ids.
 */
function buildChunkDeletionStatementsChunked(
  quadIds: string[],
  queryBuilder: LibsqlQueryBuilder,
  chunkSize: number,
): InStatement[] {
  const statements: InStatement[] = [];
  for (let index = 0; index < quadIds.length; index += chunkSize) {
    const quadIdBatch = quadIds.slice(index, index + chunkSize);
    statements.push(queryBuilder.buildDeleteByQuadIds(quadIdBatch));
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
  const insertQuadRows = quads.map((quad, index) => {
    const isLiteral = quad.object.termType === "Literal";
    const literalNode = isLiteral ? (quad.object as rdfjs.Literal) : null;

    return {
      quad_id: quadIds[index],
      s: quad.subject.value,
      s_type: quad.subject.termType,
      p: quad.predicate.value,
      o: quad.object.value,
      o_type: quad.object.termType,
      o_datatype: literalNode?.datatype?.value,
      o_lang: literalNode?.language,
      g: quad.graph.value,
      g_type: quad.graph.termType,
    };
  });

  return queryBuilder.buildBulkInsertQuads(insertQuadRows);
}

/**
 * loadLabelLiteralsBySubject queries configured label predicates and groups object literals by subject IRI.
 */
async function loadLabelLiteralsBySubject(
  client: Client,
  subjects: string[],
  labelPredicates: string[],
  lookupChunkSize: number,
  queryBuilder: LibsqlQueryBuilder,
): Promise<Map<string, string[]>> {
  const labelLiteralsBySubject = new Map<string, string[]>();
  if (subjects.length === 0 || labelPredicates.length === 0) {
    return labelLiteralsBySubject;
  }

  const uniqueSubjects = Array.from(new Set(subjects));
  for (let index = 0; index < uniqueSubjects.length; index += lookupChunkSize) {
    const subjectBatch = uniqueSubjects.slice(index, index + lookupChunkSize);
    const query = queryBuilder.buildSelectLabelLiteralsForSubjects(
      subjectBatch,
      labelPredicates,
    );
    const resultSet = await client.execute(query);
    for (const row of resultSet.rows) {
      const subject = String(row.s);
      const literalValue = String(row.o);
      const existing = labelLiteralsBySubject.get(subject) ?? [];
      existing.push(literalValue);
      labelLiteralsBySubject.set(subject, existing);
    }
  }

  return labelLiteralsBySubject;
}

/**
 * buildVectorChunkStatements decomposes, chunks, and embeds textual facts, producing projected SQL inserts.
 */
async function buildVectorChunkStatements(
  quads: rdfjs.Quad[],
  quadIds: string[],
  options: CommitPatchToLibsqlOptions,
  resolvedLabelPredicates: string[],
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

  const lookupChunkSize = options.maxLookupChunkSize ??
    DEFAULT_MAX_LOOKUP_CHUNK_SIZE;
  const uniqueSubjects = Array.from(
    new Set(chunks.map((chunk) => chunk.subject)),
  );
  const labelLiteralsBySubject = await loadLabelLiteralsBySubject(
    options.client,
    uniqueSubjects,
    resolvedLabelPredicates,
    lookupChunkSize,
    options.libsqlQueryBuilder,
  );

  const chunksWithFtsValue = chunks.map((chunk) => ({
    chunk,
    fts_value: buildChunkFtsValue(chunk, {
      labelLiteralsForSubject: labelLiteralsBySubject.get(chunk.subject) ?? [],
    }),
  }));

  // Step B: Execute deduplicated external embedding sweep (if service available)
  let vectorLookupMap: Map<string, Float32Array | number[]> | undefined;

  if (options.embeddingService) {
    const uniqueTexts = Array.from(
      new Set(
        chunksWithFtsValue.flatMap(({ chunk, fts_value }) => [
          fts_value,
          chunk.value,
        ]),
      ),
    );
    let uniqueVectors: Array<Float32Array | number[]>;
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

    vectorLookupMap = new Map<string, Float32Array | number[]>();
    for (let textIndex = 0; textIndex < uniqueTexts.length; textIndex++) {
      vectorLookupMap.set(uniqueTexts[textIndex], uniqueVectors[textIndex]!);
    }
  }

  // Step C: Generate relational chunk insertions with optional JSON vector projections
  for (const { chunk, fts_value } of chunksWithFtsValue) {
    const vector = vectorLookupMap?.get(fts_value);
    const vectorJson = vector ? JSON.stringify(Array.from(vector)) : undefined;

    statements.push(
      options.libsqlQueryBuilder.buildInsertChunk({
        quad_id: chunk.quad_id,
        subject: chunk.subject,
        predicate: chunk.predicate,
        graph: chunk.graph,
        value: chunk.value,
        fts_value,
        vectorJson,
      }),
    );
  }

  return statements;
}
