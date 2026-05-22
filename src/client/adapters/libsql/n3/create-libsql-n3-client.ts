import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Store } from "n3";

import type { ClientOptions } from "@worlds/client";
import { Client } from "@worlds/client";
import type { Patch } from "@worlds/client/quad-store";
import type { SparqlEngineInterface } from "@worlds/client/sparql-engine";
import { proxyStore } from "@worlds/client/adapters/rdfjs/n3";
import { RdfjsQuadStore } from "@worlds/client/adapters/rdfjs";
import type { LibsqlClientBaseOptions } from "@worlds/client/adapters/libsql";
import {
  commitPatchToLibsql,
  hydrateStoreFromLibsql,
  initializeLibsqlSchema,
  LibsqlQueryBuilder,
  LibsqlSearchIndex,
} from "@worlds/client/adapters/libsql";

/**
 * LibsqlN3SparqlEngineOptions contains the hydrated proxied N3 store for SPARQL adapters.
 */
export interface LibsqlN3SparqlEngineOptions {
  /** store is the hydrated and proxied in-memory N3 store used by the LibSQL synchronization layer. */
  store: Store;
}

/**
 * LibsqlN3Options configures LibSQL with hydrate → proxyStore → patch sync to LibSQL.
 */
export interface LibsqlN3Options extends LibsqlClientBaseOptions {
  /** store is an optional starting store, useful for serverless environments where the store is already initialized. */
  store?: Store;

  /** createSparqlEngine optionally attaches a caller-provided SPARQL engine over the hydrated N3 store. */
  createSparqlEngine?: (
    options: LibsqlN3SparqlEngineOptions,
  ) => SparqlEngineInterface;
}

/**
 * createLibsqlN3ClientOptions synthesizes ClientOptions for the hydrate → proxyStore → LibSQL sync path.
 */
export async function createLibsqlN3ClientOptions(
  options: LibsqlN3Options,
): Promise<ClientOptions> {
  const vectorDimensions = options.vectorDimensions ?? 32;
  const queryBuilder = new LibsqlQueryBuilder(vectorDimensions);

  await initializeLibsqlSchema(options.client, queryBuilder);

  const initialStore = options.store ?? new Store();
  if (!options.store) {
    await hydrateStoreFromLibsql(
      options.client,
      initialStore,
      options.quadFilter,
    );
  }

  const { store, drainPatches } = proxyStore(initialStore);
  const configuredSparqlEngine = options.createSparqlEngine?.({ store });

  const textSplitter = options.textSplitter ??
    new RecursiveCharacterTextSplitter({ chunkSize: 1000 });

  const searchIndex = new LibsqlSearchIndex({
    client: options.client,
    embeddingService: options.embeddingService,
    libsqlQueryBuilder: queryBuilder,
  });

  const commitChanges = async () => {
    const patches = drainPatches();
    if (patches.length === 0) return;

    const merged: Patch = {
      insertions: patches.flatMap((patch) => patch.insertions),
      deletions: patches.flatMap((patch) => patch.deletions),
    };

    await commitPatchToLibsql(merged, {
      client: options.client,
      embeddingService: options.embeddingService,
      textSplitter: textSplitter,
      maxLookupChunkSize: options.maxLookupChunkSize,
      quadFilter: options.quadFilter,
      libsqlQueryBuilder: queryBuilder,
    });
  };

  const quadStore = new RdfjsQuadStore(store);

  return {
    quadStore: {
      export: (request) => quadStore.export(request),
      import: async (request) => {
        const response = await quadStore.import(request);
        await commitChanges();
        return response;
      },
    },
    sparqlEngine: configuredSparqlEngine
      ? {
        execute: async (request) => {
          const response = await configuredSparqlEngine.execute(request);
          await commitChanges();
          return response;
        },
      }
      : undefined,
    searchIndex,
  };
}

/**
 * createLibsqlN3Client wires hydrate + N3 SPARQL + hybrid search into a ready Client.
 */
export async function createLibsqlN3Client(
  options: LibsqlN3Options,
): Promise<Client> {
  return new Client(await createLibsqlN3ClientOptions(options));
}
