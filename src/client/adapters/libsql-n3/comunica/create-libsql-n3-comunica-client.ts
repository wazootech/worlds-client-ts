import type { Client } from "@/client/client.ts";
import {
  type ComunicaQueryEngine,
  ComunicaSparqlEngine,
} from "@/client/adapters/comunica/mod.ts";
import {
  assembleLibsqlN3Client,
  type LibsqlN3AdapterOptions,
} from "../create-libsql-n3-adapter.ts";

/**
 * LibsqlN3ComunicaClientOptions configures hydrated N3 execution with Comunica SPARQL.
 */
export interface LibsqlN3ComunicaClientOptions extends LibsqlN3AdapterOptions {
  /** queryEngine is the caller-owned Comunica-compatible query engine. */
  queryEngine: ComunicaQueryEngine;
}

/**
 * createLibsqlN3ComunicaClient synthesizes a Client with Comunica SPARQL over the proxied N3 store.
 */
export async function createLibsqlN3ComunicaClient(
  options: LibsqlN3ComunicaClientOptions,
): Promise<Client> {
  const { queryEngine, ...libsqlN3Options } = options;
  return await assembleLibsqlN3Client(
    libsqlN3Options,
    ({ store }) => new ComunicaSparqlEngine({ queryEngine, store }),
  );
}
