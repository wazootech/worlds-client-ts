import type { Client as LibsqlClient } from "@libsql/client";
import { Store } from "n3";
import { QueryEngine } from "@comunica/query-sparql-rdfjs-lite";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

import { Client, type ClientOptions } from "./client.ts";
import type { ClientInterface } from "./interface.ts";
import { createIndexedStore } from "./quad-store/indexed-store.ts";
import { RdfjsQuadStore } from "./quad-store/quad-store.ts";
import { ComunicaSparqlEngine } from "./sparql-engine/sparql-engine.ts";
import { LibsqlSearchIndex } from "./search-index/providers/libsql/libsql-search-index.ts";
import { LibsqlIndexSync } from "./search-index/providers/libsql/libsql-index-sync.ts";
import { QuadChunker } from "./search-index/chunking/quad-chunker.ts";
import { hydrateStoreFromLibsql } from "./search-index/providers/libsql/libsql-loader.ts";

import type {
  ImportRequest,
  ImportResponse,
} from "./quad-store/mod.ts";
import type {
  SparqlRequest,
  SparqlResponse,
} from "./sparql-engine/mod.ts";
import type { EmbeddingService } from "./search-index/providers/libsql/libsql-search-index.ts";
import {
  makeLibsqlChunksFtsTable,
  makeLibsqlChunksIndex,
  makeLibsqlChunksQuadIdIndex,
  makeLibsqlChunksTable,
  makeLibsqlChunksTriggers,
  makeLibsqlQuadsTable,
} from "./search-index/providers/libsql/statements.ts";

/**
 * Configuration bundle for bootstrapping the integrated environment.
 */
export interface CreateClientOptions {
  /** Fully initialized LibSQL client pointing to file or in-memory target. */
  db: LibsqlClient;
  /** Service projected for transforming text literals into comparison vectors. */
  embeddingService: EmbeddingService;
  /** Optional pre-baked chunker, defaults internally if omitted. */
  chunker?: QuadChunker;
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
 * createClient handles total orchestration of the unified ecosystem.
 * It guarantees schema health, hydrates physical memory from disk, instantiates the observer bridge,
 * and returns a higher-order Client providing transactional auto-flushing.
 */
export async function createClient(
  options: CreateClientOptions,
): Promise<ClientInterface> {
  const { db, embeddingService } = options;

  // 1. Guarantee logical SQL schema existence
  await initializeSchema(db);

  // 2. Initialize and hydrate master in-memory graph
  const rawStore = new Store();
  await hydrateStoreFromLibsql(db, rawStore);

  // 3. Install dynamic Proxy Bridge tracking memory mutations
  const { store, queue } = createIndexedStore(rawStore);

  // 4. Initialize dedicated IO synchronizer
  const chunker = options.chunker ??
    new QuadChunker({
      splitter: new RecursiveCharacterTextSplitter({ chunkSize: 1000 }),
    });

  const synchronizer = new LibsqlIndexSync({
    client: db,
    embeddingService,
    chunker,
  });

  // Inner trigger flushing the collection of mutations to disk
  const flushPending = async () => {
    const patches = queue.flush();
    for (const patch of patches) {
      await synchronizer.sync(patch);
    }
  };

  // 5. Construct services sharing the Proxied observer store
  const quadStore = new RdfjsQuadStore(store);
  const sparqlEngine = new ComunicaSparqlEngine({
    store,
    queryEngine: new QueryEngine(),
  });
  const searchIndex = new LibsqlSearchIndex({
    client: db,
    embeddingService,
  });

  // 6. Return Higher-Order Client enforcing post-operation synchronization
  const baseOptions: ClientOptions = {
    quadStore,
    sparqlEngine,
    searchIndex,
  };

  class AutoSyncClient extends Client {
    constructor(opts: ClientOptions) {
      super(opts);
    }

    public override async import(
      request: ImportRequest,
    ): Promise<ImportResponse> {
      const res = await super.import(request);
      await flushPending();
      return res;
    }

    public override async sparql(
      request: SparqlRequest,
    ): Promise<SparqlResponse> {
      const res = await super.sparql(request);
      await flushPending();
      return res;
    }
  }

  return new AutoSyncClient(baseOptions);
}
