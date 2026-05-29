import type { Adapter } from "@/client/client.ts";
import type { SparqlEngineInterface } from "@/client/sparql-engine/mod.ts";
import type { LibsqlQuadStore } from "./libsql-quad-store.ts";
import type { LibsqlRdfjsStore } from "./libsql-rdfjs-store.ts";
import type { LibsqlAdapterInfrastructure } from "./create-libsql-adapter-infrastructure.ts";

/**
 * LibsqlAdapterFromStoresOptions configures shared LibSQL adapter assembly over suffixed store facades.
 */
export interface LibsqlAdapterFromStoresOptions {
  /** infrastructure is shared schema, search, and patch-sync state from createLibsqlAdapterInfrastructure. */
  infrastructure: LibsqlAdapterInfrastructure;

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
 * createLibsqlAdapterFromStores assembles Client-facing quad/SPARQL facades over shared LibSQL infrastructure.
 */
export function createLibsqlAdapterFromStores(
  options: LibsqlAdapterFromStoresOptions,
): Adapter {
  const { searchIndex } = options.infrastructure;
  const configuredSparqlEngine = options.createSparqlEngine?.({
    store: options.libsqlRdfjsStore,
  });

  return {
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
  };
}
