import type { Client as LibsqlClient } from "@libsql/client";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Store } from "n3";
import { QueryEngine } from "@comunica/query-sparql-rdfjs-lite";

import type { ClientOptions } from "#/client/client.ts";
import type { Patch } from "#/client/quad-store/patch.ts";
import type { TextSplitterInterface } from "#/client/search-index/quad-chunker/chunk-quads.ts";
import type { EmbeddingService } from "#/client/search-index/embedding-service/mod.ts";
import type { QuadFilter } from "#/client/quad-store/quad-filter.ts";

import { proxyStore } from "#/client/providers/rdfjs/n3/proxy-store.ts";
import { RdfjsQuadStore } from "#/client/providers/rdfjs/rdfjs-quad-store.ts";
import { ComunicaSparqlEngine } from "#/client/providers/comunica/comunica-sparql-engine.ts";
import { LibsqlSearchIndex } from "./libsql-search-index.ts";
import { commitPatchToLibsql } from "./commit-patch-to-libsql.ts";
import { hydrateStoreFromLibsql } from "./hydrate-store-from-libsql.ts";

import { LibsqlQueryBuilder } from "./libsql-query-builder.ts";

const queryEngine = new QueryEngine();

/**
 * LibsqlOptions details the aggregate internal subsystems powering active execution.
 */
export interface LibsqlOptions {
  /** client is the underlying LibSQL client pointing to the database. */
  client: LibsqlClient;

  /** embeddingService is an optional service projected for transforming text literals into comparison vectors. */
  embeddingService?: EmbeddingService;

  /** textSplitter is an optional custom text splitting facility, defaults to sensible character-based splitting. */
  textSplitter?: TextSplitterInterface;

  /** store is an optional starting store, useful for serverless environments where the store is already initialized. */
  store?: Store;

  /** maxLookupChunkSize specifies the maximum number of host parameters allowed in cache query IN clauses before split-chunking. Defaults to a conservative 800 (safely below historical SQLite 999 SQLITE_MAX_VARIABLE_NUMBER variable caps with generous headroom). */
  maxLookupChunkSize?: number;

  /** quadFilter defines positive synchronization inclusion boundaries, governing which sub-graphs hydrate on boot and persist on write, leaving remaining data to serve as fast ephemeral in-memory context. */
  quadFilter?: QuadFilter;

  /**
   * vectorDimensions pins F32_BLOB width for chunk vectors and must match every embedding produced when embeddingService is set (default 32).
   */
  vectorDimensions?: number;
}

/**
 * initializeSchema synchronously checks and creates the full set of persistent tables needed.
 */
async function initializeSchema(
  db: LibsqlClient,
  queryBuilder: LibsqlQueryBuilder,
): Promise<void> {
  await db.execute(queryBuilder.buildLibsqlQuadsTable());
  await db.execute(queryBuilder.buildLibsqlChunksTable());
  await db.execute(queryBuilder.buildLibsqlChunksQuadIdIndex());
  await db.execute(queryBuilder.buildLibsqlChunksFtsTable());
  await db.execute(queryBuilder.buildLibsqlChunksIndex());
  for (const sql of queryBuilder.buildLibsqlChunksTriggers()) {
    await db.execute(sql);
  }
}

/**
 * provideLibsql synthesizes the high-order transactional orchestration machinery
 * dedicated explicitly to maintaining LibSQL replication integrity.
 * It bundles schema initialization, incremental memory monitoring, and cascading
 * text search hydration into standard, non-specialized core components.
 *
 * @param options Target database, embeddings drivers, and optional component overrides.
 * @returns Uncoupled ClientOptions ready for instant ingestion by the universal constructor.
 */
export async function provideLibsql(
  options: LibsqlOptions,
): Promise<ClientOptions> {
  const vectorDimensions = options.vectorDimensions ?? 32;
  const queryBuilder = new LibsqlQueryBuilder(vectorDimensions);

  // 1. Ensure foundational tables are resident before initializing higher systems.
  await initializeSchema(options.client, queryBuilder);

  // 2. Resolve standard core memory context with optional user-driven injection.
  const initialStore = options.store ?? new Store();
  if (!options.store) {
    await hydrateStoreFromLibsql(
      options.client,
      initialStore,
      options.quadFilter,
    );
  }

  // 3. Instrument memory layer for transparent transaction accumulation.
  const { store, drainPatches } = proxyStore(initialStore);

  // 4. Configure specialized support utilities.
  const textSplitter = options.textSplitter ??
    new RecursiveCharacterTextSplitter({ chunkSize: 1000 });

  const searchIndex = new LibsqlSearchIndex({
    client: options.client,
    embeddingService: options.embeddingService,
    libsqlQueryBuilder: queryBuilder,
  });

  /**
   * commitChanges unifies monitoring queue draining with standard LibSQL
   * replication pipeline processing.
   */
  const commitChanges = async () => {
    const patches = drainPatches();
    if (patches.length === 0) return;

    const merged: Patch = {
      insertions: patches.flatMap((p) => p.insertions),
      deletions: patches.flatMap((p) => p.deletions),
    };

    // Execute internal standard replication.
    await commitPatchToLibsql(merged, {
      client: options.client,
      embeddingService: options.embeddingService,
      textSplitter: textSplitter,
      maxLookupChunkSize: options.maxLookupChunkSize,
      quadFilter: options.quadFilter,
      libsqlQueryBuilder: queryBuilder,
    });
  };

  // 5. Synthesize foundational base component drivers.
  const quadStore = new RdfjsQuadStore(store);
  const sparqlEngine = new ComunicaSparqlEngine({
    queryEngine,
    store,
  });

  // 7. Deliver aggregated composite ready for standard instantiation.
  return {
    quadStore: {
      export: (request) => quadStore.export(request),
      import: async (request) => {
        const response = await quadStore.import(request);
        await commitChanges();
        return response;
      },
    },
    sparqlEngine: {
      execute: async (request) => {
        const response = await sparqlEngine.execute(request);
        await commitChanges();
        return response;
      },
    },
    searchIndex,
  };
}
