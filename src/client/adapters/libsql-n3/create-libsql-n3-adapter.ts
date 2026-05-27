import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Store } from "n3";

import { Client } from "@/client/client.ts";
import type { ExportRequest, ImportRequest } from "@/client/quad-store/mod.ts";
import { mergePatches } from "@/client/quad-store/mod.ts";
import type {
  SparqlEngineInterface,
  SparqlRequest,
} from "@/client/sparql-engine/mod.ts";
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
}

/**
 * AttachLibsqlN3SparqlEngine wires a SPARQL engine after the proxied N3 store exists (in-repo preset use only).
 */
export type AttachLibsqlN3SparqlEngine = (
  options: { store: Store },
) => SparqlEngineInterface;

/**
 * assembleLibsqlN3Client builds a Client for the hydrate → createProxiedN3Store → LibSQL sync path.
 * Prefer createLibsqlN3Client (search/import) or createLibsqlN3ComunicaClient (Comunica SPARQL).
 */
export async function assembleLibsqlN3Client(
  options: LibsqlN3AdapterOptions,
  attachSparqlEngine?: AttachLibsqlN3SparqlEngine,
): Promise<Client> {
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
  const configuredSparqlEngine = attachSparqlEngine?.({ store });

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

  const wrappedQuadStore = {
    export: (request: ExportRequest) => quadStore.export(request),
    import: async (request: ImportRequest) => {
      patchSync.beforeImport();
      const response = await quadStore.import(request);
      await commitChanges();
      await patchSync.afterImport();
      return response;
    },
  };

  const wrappedSparqlEngine = configuredSparqlEngine
    ? {
      sparql: async (request: SparqlRequest) => {
        const response = await configuredSparqlEngine.sparql(request);
        await commitChanges();
        return response;
      },
    }
    : undefined;

  return new Client(wrappedQuadStore, searchIndex, wrappedSparqlEngine);
}

/**
 * createLibsqlN3Client synthesizes a Client for import, export, and search without SPARQL.
 * For Comunica SPARQL, use createLibsqlN3ComunicaClient from `@worlds/client/adapters/libsql-n3/comunica`.
 */
export async function createLibsqlN3Client(
  options: LibsqlN3AdapterOptions,
): Promise<Client> {
  return await assembleLibsqlN3Client(options);
}

/**
 * createLibsqlN3Adapter is deprecated; use createLibsqlN3Client. Removed in 0.0.17.
 */
export const createLibsqlN3Adapter = createLibsqlN3Client;
