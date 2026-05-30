import { Client } from "@/client/client.ts";
import type { ClientInterface } from "@/client/client.ts";
import type { SparqlEngineInterface } from "@/client/sparql-engine/mod.ts";
import type { LibsqlQuadStore } from "./libsql-quad-store.ts";
import type { LibsqlRdfjsStore } from "./libsql-rdfjs-store.ts";
import type { LibsqlClientInfrastructure } from "./create-libsql-client-infrastructure.ts";

/**
 * LibsqlClientFromStoresOptions configures shared LibSQL client assembly over suffixed store facades.
 */
export interface LibsqlClientFromStoresOptions {
  /** infrastructure is shared schema, search, and patch-sync state from createLibsqlClientInfrastructure. */
  infrastructure: LibsqlClientInfrastructure;

  /** libsqlQuadStore serves Client import and export. */
  libsqlQuadStore: LibsqlQuadStore;

  /** libsqlRdfjsStore serves Comunica SPARQL match and buffered updates. */
  libsqlRdfjsStore: LibsqlRdfjsStore;

  /** createSparqlEngine optionally attaches a caller-provided SPARQL engine over libsqlRdfjsStore. */
  createSparqlEngine?: (
    options: { store: LibsqlRdfjsStore },
  ) => SparqlEngineInterface;
}

/**
 * createLibsqlClientFromStores assembles a Client over shared LibSQL infrastructure.
 */
export function createLibsqlClientFromStores(
  options: LibsqlClientFromStoresOptions,
): ClientInterface {
  const { searchIndex } = options.infrastructure;
  const sparqlEngine = options.createSparqlEngine?.({
    store: options.libsqlRdfjsStore,
  });

  return new Client({
    quadStore: options.libsqlQuadStore,
    sparqlEngine,
    searchIndex,
  });
}
