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
 * LibsqlN3ComunicaClientOptions configures hydrate, proxied N3, and LibSQL sync with Comunica SPARQL.
 */
export interface LibsqlN3ComunicaClientOptions extends LibsqlN3AdapterOptions {
  /** queryEngine is the caller-owned Comunica-compatible query engine. */
  queryEngine: ComunicaQueryEngine;
}

/**
 * createLibsqlN3ComunicaClient synthesizes a Client with Comunica SPARQL over the proxied N3 store.
 * Pass a warmed `store` to skip hydration (edge isolates); omit `store` to hydrate once at construction.
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
