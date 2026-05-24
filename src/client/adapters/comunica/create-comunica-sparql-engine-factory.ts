import type * as rdfjs from "@rdfjs/types";
import type { SparqlEngineInterface } from "@/client/sparql-engine/mod.ts";
import {
  type ComunicaQueryEngine,
  ComunicaSparqlEngine,
} from "./comunica-sparql-engine.ts";

/**
 * CreateComunicaSparqlEngineFactoryOptions configures a Comunica-backed createSparqlEngine callback.
 */
export interface CreateComunicaSparqlEngineFactoryOptions {
  /** queryEngine is the caller-owned Comunica-compatible query engine. */
  queryEngine: ComunicaQueryEngine;
}

/**
 * createComunicaSparqlEngineFactory returns a createSparqlEngine callback for adapters exposing `{ store }`.
 */
export function createComunicaSparqlEngineFactory(
  options: CreateComunicaSparqlEngineFactoryOptions,
): (sparqlEngineOptions: { store: rdfjs.Store }) => SparqlEngineInterface {
  return ({ store }) =>
    new ComunicaSparqlEngine({ queryEngine: options.queryEngine, store });
}

/**
 * createComunicaLibsqlSparqlEngineFactory returns a createSparqlEngine callback for hexastore LibSQL clients.
 */
export function createComunicaLibsqlSparqlEngineFactory(
  options: CreateComunicaSparqlEngineFactoryOptions,
): (
  sparqlEngineOptions: { libsqlStore: rdfjs.Store },
) => SparqlEngineInterface {
  const fromStore = createComunicaSparqlEngineFactory(options);
  return ({ libsqlStore }) => fromStore({ store: libsqlStore });
}
