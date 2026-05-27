import type { Client } from "@/client/client.ts";
import {
  type ComunicaQueryEngine,
  ComunicaSparqlEngine,
} from "@/client/adapters/comunica/mod.ts";
import {
  assembleLibsqlClient,
  type LibsqlAdapterOptions,
} from "../create-libsql-adapter.ts";

/**
 * LibsqlComunicaClientOptions configures LibsqlStore hexastore execution with Comunica SPARQL.
 */
export interface LibsqlComunicaClientOptions extends LibsqlAdapterOptions {
  /** queryEngine is the caller-owned Comunica-compatible query engine. */
  queryEngine: ComunicaQueryEngine;
}

/**
 * createLibsqlComunicaClient synthesizes a Client with Comunica SPARQL over LibsqlStore.
 */
export async function createLibsqlComunicaClient(
  options: LibsqlComunicaClientOptions,
): Promise<Client> {
  const { queryEngine, ...libsqlOptions } = options;
  return await assembleLibsqlClient(
    libsqlOptions,
    ({ libsqlStore }) =>
      new ComunicaSparqlEngine({ queryEngine, store: libsqlStore }),
  );
}
