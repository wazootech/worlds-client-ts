import type { Client as LibsqlClient } from "@libsql/client";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Store } from "n3";

import { createClient as baseCreateClient } from "#/client/factory.ts";
import type { ClientInterface } from "#/client/interface.ts";
import { LibsqlSearchIndex } from "./libsql-search-index.ts";
import { LibsqlSynchronizer } from "./libsql-synchronizer.ts";
import { QuadChunker } from "#/client/search-index/quad-chunker/quad-chunker.ts";
import { hydrateStoreFromLibsql } from "./libsql-loader.ts";
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
  /** Optional pre-baked chunker, defaults internally if omitted. */
  chunker?: QuadChunker;
  /** Optional pre-warmed store. If omitted, a fresh one is instantiated and hydrated. */
  store?: Store;
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
    await hydrateStoreFromLibsql(db, rawStore);
  }

  // Setup specific IO strategies required by the Synchronizer.
  const chunker = options.chunker ??
    new QuadChunker({
      splitter: new RecursiveCharacterTextSplitter({ chunkSize: 1000 }),
    });

  const synchronizer = new LibsqlSynchronizer({
    client: db,
    embeddingService,
    chunker,
  });

  const searchIndex = new LibsqlSearchIndex({
    client: db,
    embeddingService,
  });

  // Delegate to generalized core for memory store composition and bridge instantiation.
  return baseCreateClient({
    store: rawStore,
    searchIndex,
    sync: (patch) => synchronizer.sync(patch),
  });
}
