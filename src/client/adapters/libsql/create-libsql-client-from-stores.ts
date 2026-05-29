import type { Client } from "@/client/client.ts";
import { createClientFromDependencies } from "@/client/client.ts";
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
): Client {
  const { searchIndex } = options.infrastructure;
  const configuredSparqlEngine = options.createSparqlEngine?.({
    store: options.libsqlRdfjsStore,
  });

  return createClientFromDependencies({
    quadStore: options.libsqlQuadStore,
    sparqlEngine: configuredSparqlEngine
      ? {
        execute: async (request) => {
          const response = await configuredSparqlEngine.execute(request);
          await options.libsqlRdfjsStore.commit();
          return response;
        },
      }
      : undefined,
    searchIndex,
  });
}
