import type { Client as LibsqlClient } from "@libsql/client";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Store } from "n3";
import { QueryEngine } from "@comunica/query-sparql-rdfjs-lite";

import type { ClientOptions } from "#/client/client.ts";
import type { Patch } from "#/client/quad-store/patch-queue-interface.ts";
import type { TextSplitterInterface } from "#/client/search-index/quad-chunker/chunk-quads.ts";
import type { EmbeddingService } from "#/client/search-index/embedding-service/mod.ts";

import { createProxiedStore } from "#/client/quad-store/create-proxied-store.ts";
import { RdfjsQuadStore } from "#/client/quad-store/rdfjs-quad-store.ts";
import { ComunicaSparqlEngine } from "#/client/providers/comunica/comunica-sparql-engine.ts";
import { LibsqlSearchIndex } from "./libsql-search-index.ts";
import { syncLibsql } from "./sync-libsql.ts";
import { hydrateStoreFromLibsql } from "./hydrate-store-from-libsql.ts";

import {
  makeLibsqlChunksFtsTable,
  makeLibsqlChunksIndex,
  makeLibsqlChunksQuadIdIndex,
  makeLibsqlChunksTable,
  makeLibsqlChunksTriggers,
  makeLibsqlQuadsTable,
} from "./statements.ts";

const queryEngine = new QueryEngine();

/**
 * LibsqlOptions details the aggregate internal subsystems powering active execution.
 */
export interface LibsqlOptions {
  /** client is the underlying LibSQL client pointing to the database. */
  client: LibsqlClient;

  /** embeddingService is the service projected for transforming text literals into comparison vectors. */
  embeddingService: EmbeddingService;

  /** textSplitter is an optional custom text splitting facility, defaults to sensible character-based splitting. */
  textSplitter?: TextSplitterInterface;

  /** store is an optional starting store, useful for serverless environments where the store is already initialized. */
  store?: Store;

  /**
   * @todo FUTURE ENHANCEMENT: Introduce `hydrationFilters?: { graphs?: string[] }`
   * to enable targeted scoped hydration. Essential for serverless cold-start optimization
   * limiting memory ingest to explicitly required tenant domains.
   */
}

/**
 * initializeSchema synchronously checks and creates the full set of persistent tables needed.
 */
async function initializeSchema(db: LibsqlClient): Promise<void> {
  await db.execute(makeLibsqlQuadsTable());
  await db.execute(makeLibsqlChunksTable());
  await db.execute(makeLibsqlChunksQuadIdIndex());
  await db.execute(makeLibsqlChunksFtsTable());
  await db.execute(makeLibsqlChunksIndex());
  for (const sql of makeLibsqlChunksTriggers()) {
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
  // 1. Ensure foundational tables are resident before initializing higher systems.
  await initializeSchema(options.client);

  // 2. Resolve standard core memory context with optional user-driven injection.
  const initialStore = options.store ?? new Store();
  if (!options.store) {
    await hydrateStoreFromLibsql(options.client, initialStore);
  }

  // 3. Instrument memory layer for transparent transaction accumulation.
  const { store, queue } = createProxiedStore(initialStore);

  // 4. Configure specialized support utilities.
  const textSplitter = options.textSplitter ??
    new RecursiveCharacterTextSplitter({ chunkSize: 1000 });

  const searchIndex = new LibsqlSearchIndex({
    client: options.client,
    embeddingService: options.embeddingService,
  });

  /**
   * commitChanges unifies monitoring queue flushing with standard LibSQL
   * replication pipeline processing.
   */
  const commitChanges = async () => {
    const patches = queue.flush();
    if (patches.length === 0) return;

    const merged: Patch = {
      insertions: patches.flatMap((p) => p.insertions),
      deletions: patches.flatMap((p) => p.deletions),
    };

    // Execute internal standard replication.
    await syncLibsql(merged, {
      client: options.client,
      embeddingService: options.embeddingService,
      textSplitter: textSplitter,
    });
  };

  // 5. Synthesize foundational base component drivers.
  const quadStore = new RdfjsQuadStore(store);
  const sparqlEngine = new ComunicaSparqlEngine({
    store,
    queryEngine,
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
