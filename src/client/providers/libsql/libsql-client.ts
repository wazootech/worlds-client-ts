import type { Client as LibsqlClient } from "@libsql/client";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Store } from "n3";

import { createClient as createBaseClient } from "#/client/factory.ts";
import type { ClientInterface } from "#/client/interface.ts";
import { LibsqlSearchIndex } from "./libsql-search-index.ts";
import { syncLibsql } from "./libsql-quad-synchronizer.ts";
import type { TextSplitterInterface } from "#/client/search-index/quad-chunker/quad-chunker.ts";
import { hydrateStoreFromLibsql } from "./libsql-quad-hydrator.ts";
import type { EmbeddingService } from "#/client/search-index/embedding-service/mod.ts";

import {
  makeLibsqlChunksFtsTable,
  makeLibsqlChunksIndex,
  makeLibsqlChunksQuadIdIndex,
  makeLibsqlChunksTable,
  makeLibsqlChunksTriggers,
  makeLibsqlQuadsTable,
} from "./statements.ts";

/**
 * Configuration bundle for bootstrapping the integrated LibSQL environment.
 */
export interface CreateClientOptions {
  /** Fully initialized LibSQL client pointing to file or in-memory target. */
  db: LibsqlClient;
  /** Service projected for transforming text literals into comparison vectors. */
  embeddingService: EmbeddingService;
  /** Optional custom text splitting facility, defaults to sensible character-based splitting. */
  textSplitter?: TextSplitterInterface;
  /** Optional pre-warmed store. If omitted, a fresh one is instantiated and hydrated. */
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
 * createClient handles total orchestration of the LibSQL unified ecosystem.
 * It guarantees schema health and hands off base client fabrication to the generalized factory.
 */
export async function createClient(
  options: CreateClientOptions,
): Promise<ClientInterface> {
  const { db, embeddingService } = options;

  // Prepare logical SQL schema context.
  await initializeSchema(db);

  // Re-use pre-warmed store if provided, otherwise synthesize and populate new context.
  const rawStore = options.store ?? new Store();
  if (!options.store) {
    // TODO PERFORMANCE: Currently executes full eager hydration (O(N) universe load).
    // For extreme serverless environments, consider implementing a virtual Comunica actor
    // proxying SPARQL DIRECTLY into SQLite WHERE conditions to eliminate runtime parsing latency.
    await hydrateStoreFromLibsql(db, rawStore);
  }

  // Setup specific semantic splitting strategies defaults
  const splitter = options.textSplitter ??
    new RecursiveCharacterTextSplitter({ chunkSize: 1000 });

  const searchIndex = new LibsqlSearchIndex({
    client: db,
    embeddingService,
  });

  // Delegate to generalized core for memory store composition and bridge instantiation.
  return createBaseClient({
    store: rawStore,
    searchIndex,
    sync: (patch) =>
      syncLibsql(patch, {
        client: db,
        embeddingService,
        textSplitter: splitter,
      }),
  });
}
