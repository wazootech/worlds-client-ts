import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

import { Client } from "@/client/client.ts";
import type { ExportRequest, ImportRequest } from "@/client/quad-store/mod.ts";
import type {
  SparqlEngineInterface,
  SparqlRequest,
} from "@/client/sparql-engine/mod.ts";
import { RdfjsQuadStore } from "@/client/adapters/rdfjs/mod.ts";

import type { LibsqlClientBaseOptions } from "./libsql-client-base-options.ts";
import { LibsqlSearchIndex } from "@/client/adapters/libsql/search/mod.ts";
import {
  initializeLibsqlSchema,
  LibsqlQueryBuilder,
  LibsqlStore,
} from "@/client/adapters/libsql/store/mod.ts";
import { createLibsqlPatchSyncState } from "@/client/adapters/libsql/sync/mod.ts";

/**
 * LibsqlAdapterOptions configures LibSQL execution through LibsqlStore and hexastore indexes.
 */
export interface LibsqlAdapterOptions extends LibsqlClientBaseOptions {}

/**
 * AttachLibsqlSparqlEngine wires a SPARQL engine after LibsqlStore exists (in-repo preset use only).
 */
export type AttachLibsqlSparqlEngine = (
  options: { libsqlStore: LibsqlStore },
) => SparqlEngineInterface;

/**
 * assembleLibsqlClient builds a Client for LibsqlStore + hexastore indexes.
 * Prefer createLibsqlClient (search/import) or createLibsqlComunicaClient (Comunica SPARQL).
 */
export async function assembleLibsqlClient(
  options: LibsqlAdapterOptions,
  attachSparqlEngine?: AttachLibsqlSparqlEngine,
): Promise<Client> {
  const vectorDimensions = options.vectorDimensions ?? 32;
  const queryBuilder = new LibsqlQueryBuilder(vectorDimensions);

  await initializeLibsqlSchema(options.client, queryBuilder);

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

  const libsqlStore = new LibsqlStore({
    client: options.client,
    queryBuilder,
    commitHandler: patchSync.persistPatch,
    matchPageSize: options.matchPageSize,
  });

  const configuredSparqlEngine = attachSparqlEngine?.({ libsqlStore });

  const quadStore = new RdfjsQuadStore(libsqlStore);

  const wrappedQuadStore = {
    export: (request: ExportRequest) => quadStore.export(request),
    import: async (request: ImportRequest) => {
      patchSync.beforeImport();
      const response = await quadStore.import(request);
      await libsqlStore.commit();
      await patchSync.afterImport();
      return response;
    },
  };

  const wrappedSparqlEngine = configuredSparqlEngine
    ? {
      sparql: async (request: SparqlRequest) => {
        const response = await configuredSparqlEngine.sparql(request);
        await libsqlStore.commit();
        return response;
      },
    }
    : undefined;

  return new Client(wrappedQuadStore, searchIndex, wrappedSparqlEngine);
}

/**
 * createLibsqlClient synthesizes a Client for import, export, and search without SPARQL.
 * For Comunica SPARQL, use createLibsqlComunicaClient from `@worlds/client/adapters/libsql/comunica`.
 */
export async function createLibsqlClient(
  options: LibsqlAdapterOptions,
): Promise<Client> {
  return await assembleLibsqlClient(options);
}

/**
 * createLibsqlAdapter is deprecated; use createLibsqlClient. Removed in 0.0.17.
 */
export const createLibsqlAdapter = createLibsqlClient;
