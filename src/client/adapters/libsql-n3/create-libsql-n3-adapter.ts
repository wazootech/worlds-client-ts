import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Store } from "n3";

import type { Adapter } from "@/client/client.ts";
import { mergePatches } from "@/client/quad-store/mod.ts";
import type { SparqlEngineInterface } from "@/client/sparql-engine/mod.ts";
import { createProxiedN3Store } from "@/client/quad-store/n3/mod.ts";
import { RdfjsQuadStore } from "@/client/adapters/rdfjs/mod.ts";
import type { LibsqlClientBaseOptions } from "@/client/adapters/libsql/mod.ts";
import {
  createLibsqlPatchSyncState,
  initializeLibsqlSchema,
  LibsqlQueryBuilder,
  LibsqlSearchIndex,
} from "@/client/adapters/libsql/mod.ts";
import { hydrateStoreFromLibsql } from "./hydrate-store-from-libsql.ts";

/**
 * LibsqlN3AdapterOptions configures LibSQL with hydrate → createProxiedN3Store → patch sync to LibSQL.
 */
export interface LibsqlN3AdapterOptions extends LibsqlClientBaseOptions {
  /** store is an optional starting store, useful for serverless environments where the store is already initialized. */
  store?: Store;

  /** createSparqlEngine optionally attaches a caller-provided SPARQL engine over the hydrated N3 store. */
  createSparqlEngine?: (
    options: { store: Store },
  ) => SparqlEngineInterface;
}

/**
 * createLibsqlN3Adapter synthesizes a Adapter for the hydrate → createProxiedN3Store → LibSQL sync path.
 */
export async function createLibsqlN3Adapter(
  options: LibsqlN3AdapterOptions,
): Promise<Adapter> {
  const vectorDimensions = options.vectorDimensions ?? 32;
  const queryBuilder = new LibsqlQueryBuilder(vectorDimensions);

  await initializeLibsqlSchema(options.client, queryBuilder);

  const initialStore = options.store ?? new Store();
  if (!options.store) {
    await hydrateStoreFromLibsql(
      options.client,
      initialStore,
      { include: options.include, exclude: options.exclude },
      queryBuilder,
    );
  }

  const { store, drainPatches } = createProxiedN3Store(initialStore);
  const configuredSparqlEngine = options.createSparqlEngine?.({ store });

  const textSplitter = options.textSplitter ??
    new RecursiveCharacterTextSplitter({ chunkSize: 1000 });

  const searchIndex = new LibsqlSearchIndex({
    ...options,
    libsqlQueryBuilder: queryBuilder,
    textSplitter,
  });

  const patchSync = createLibsqlPatchSyncState({
    ...options,
    libsqlQueryBuilder: queryBuilder,
    textSplitter,
  });

  const commitChanges = async () => {
    const patches = drainPatches();
    if (patches.length === 0) return;

    await patchSync.persistPatch(mergePatches(patches));
  };

  const quadStore = new RdfjsQuadStore(store);

  return {
    quadStore: {
      export: (request) => quadStore.export(request),
      import: async (request) => {
        patchSync.beforeImport();
        const response = await quadStore.import(request);
        await commitChanges();
        await patchSync.afterImport();
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
