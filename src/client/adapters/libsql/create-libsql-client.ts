import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

import type { ClientOptions } from "@/client/client.ts";
import { Client } from "@/client/client.ts";
import type { Patch } from "@/client/quad-store/mod.ts";
import type { SparqlEngineInterface } from "@/client/sparql-engine/mod.ts";
import { RdfjsQuadStore } from "@/client/adapters/rdfjs/mod.ts";

import { LibsqlSearchIndex } from "./libsql-search-index.ts";
import { commitPatchToLibsql } from "./commit-patch-to-libsql.ts";
import { initializeLibsqlSchema } from "./initialize-libsql-schema.ts";
import type { LibsqlClientBaseOptions } from "./libsql-client-base-options.ts";
import { LibsqlQueryBuilder } from "./libsql-query-builder.ts";
import { LibsqlStore } from "./libsql-store.ts";

/**
 * LibsqlSparqlEngineOptions contains the hexastore-backed LibsqlStore for SPARQL adapters.
 */
export interface LibsqlSparqlEngineOptions {
  /** libsqlStore is the durable hexastore-backed RDF/JS store (SQL index seeks, no N3 hydration). */
  libsqlStore: LibsqlStore;
}

/**
 * LibsqlOptions configures LibSQL execution through LibsqlStore and hexastore indexes.
 */
export interface LibsqlOptions extends LibsqlClientBaseOptions {
  /** createSparqlEngine optionally attaches a caller-provided SPARQL engine over LibsqlStore. */
  createSparqlEngine?: (
    options: LibsqlSparqlEngineOptions,
  ) => SparqlEngineInterface;
}

/**
 * createLibsqlClientOptions synthesizes ClientOptions for direct LibsqlStore + hexastore indexes.
 */
export async function createLibsqlClientOptions(
  options: LibsqlOptions,
): Promise<ClientOptions> {
  const vectorDimensions = options.vectorDimensions ?? 32;
  const queryBuilder = new LibsqlQueryBuilder(vectorDimensions);

  await initializeLibsqlSchema(options.client, queryBuilder);

  const textSplitter = options.textSplitter ??
    new RecursiveCharacterTextSplitter({ chunkSize: 1000 });

  const searchIndex = new LibsqlSearchIndex({
    client: options.client,
    embeddingService: options.embeddingService,
    libsqlQueryBuilder: queryBuilder,
  });

  const persistPatch = async (patch: Patch) => {
    await commitPatchToLibsql(patch, {
      client: options.client,
      embeddingService: options.embeddingService,
      textSplitter: textSplitter,
      maxLookupChunkSize: options.maxLookupChunkSize,
      quadFilter: options.quadFilter,
      libsqlQueryBuilder: queryBuilder,
    });
  };

  const libsqlStore = new LibsqlStore(
    options.client,
    queryBuilder,
    persistPatch,
    { matchPageSize: options.matchPageSize },
  );

  const configuredSparqlEngine = options.createSparqlEngine?.({ libsqlStore });

  const quadStore = new RdfjsQuadStore(libsqlStore);

  return {
    quadStore: {
      export: (request) => quadStore.export(request),
      import: async (request) => {
        const response = await quadStore.import(request);
        await libsqlStore.commit();
        return response;
      },
    },
    sparqlEngine: configuredSparqlEngine
      ? {
        execute: async (request) => {
          const response = await configuredSparqlEngine.execute(request);
          await libsqlStore.commit();
          return response;
        },
      }
      : undefined,
    searchIndex,
  };
}

/**
 * createLibsqlClient wires hexastore SPARQL + hybrid search into a ready Client without N3 hydration.
 */
export async function createLibsqlClient(
  options: LibsqlOptions,
): Promise<Client> {
  return new Client(await createLibsqlClientOptions(options));
}
