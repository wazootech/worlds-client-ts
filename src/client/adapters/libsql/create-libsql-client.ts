import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Client } from "@/client/client.ts";

import type { ClientInterface } from "@/client/client.ts";
import type { ComunicaQueryEngine } from "@/client/adapters/comunica/mod.ts";
import { LibsqlSearchIndex } from "@/client/adapters/libsql/search-index/mod.ts";
import { createLibsqlPersistHooks } from "@/client/adapters/libsql/rdfjs-store/sync/mod.ts";
import { resolveImportLifecycle } from "@/client/import-lifecycle/mod.ts";
import { ComunicaSparqlEngine } from "@/client/adapters/comunica/mod.ts";

import type { LibsqlClientBaseOptions } from "./libsql-client-base-options.ts";
import { LibsqlQuadStore } from "./quad-store/mod.ts";
import { LibsqlRdfjsStore } from "./rdfjs-store/mod.ts";
import { initializeLibsqlSchema } from "./rdfjs-store/sql/initialize-libsql-schema.ts";
import { LibsqlQueryBuilder } from "./rdfjs-store/sql/libsql-query-builder.ts";
import { createBufferedQuadTransaction } from "@/client/rdfjs-buffer/mod.ts";
import type * as rdfjs from "@rdfjs/types";

/**
 * LibsqlClientOptions configures LibSQL execution through LibsqlRdfjsStore and hexastore indexes.
 */
export interface LibsqlClientOptions extends LibsqlClientBaseOptions {
  /** queryEngine optionally enables built-in Comunica SPARQL over LibsqlRdfjsStore. */
  queryEngine?: ComunicaQueryEngine;
}

/**
 * createLibsqlClient synthesizes a Client for LibsqlRdfjsStore + LibsqlQuadStore hexastore indexes.
 */
export async function createLibsqlClient(
  options: LibsqlClientOptions,
): Promise<ClientInterface> {
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

  const persistHooks = createLibsqlPersistHooks({
    ...options,
    libsqlQueryBuilder: queryBuilder,
    textSplitter,
  });

  const importLifecycle = resolveImportLifecycle({
    beforeImport: persistHooks.beforeImport,
    afterImport: persistHooks.afterImport,
  });

  const libsqlRdfjsStore = new LibsqlRdfjsStore({
    client: options.client,
    queryBuilder,
    matchPageSize: options.matchPageSize,
  });

  const transactionFactory = () => {
    return createBufferedQuadTransaction({
      commitHandler: persistHooks.commitHandler,
      importLifecycle,
    });
  };

  const libsqlQuadStore = new LibsqlQuadStore({
    libsqlRdfjsStore,
    commitHandler: persistHooks.commitHandler,
    importLifecycle,
  });

  const sparqlEngine = options.queryEngine
    ? new ComunicaSparqlEngine({
      queryEngine: options.queryEngine,
      readSource: libsqlRdfjsStore as unknown as rdfjs.Store,
      transactionFactory,
    })
    : undefined;

  return new Client({
    quadStore: libsqlQuadStore,
    searchIndex,
    sparqlEngine,
  });
}
