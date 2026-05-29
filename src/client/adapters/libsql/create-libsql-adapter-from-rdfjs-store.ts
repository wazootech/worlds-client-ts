import type * as rdfjs from "@rdfjs/types";

import type { Adapter } from "@/client/client.ts";
import type { SparqlEngineInterface } from "@/client/sparql-engine/mod.ts";
import { RdfjsQuadStore } from "@/client/adapters/rdfjs/mod.ts";

import type { LibsqlAdapterInfrastructure } from "./create-libsql-adapter-infrastructure.ts";

/**
 * LibsqlAdapterFromRdfjsStoreOptions configures shared LibSQL adapter assembly over an RDF/JS store.
 */
export interface LibsqlAdapterFromRdfjsStoreOptions {
  /** infrastructure is shared schema, search, and patch-sync state from createLibsqlAdapterInfrastructure. */
  infrastructure: LibsqlAdapterInfrastructure;

  /** rdfjsStore is the RDF/JS store Comunica and quad import/export use (LibsqlStore or proxied N3). */
  rdfjsStore: rdfjs.Store;

  /** commitPendingChanges flushes buffered mutations to LibSQL via persistPatch. */
  commitPendingChanges: () => Promise<void>;

  /** createSparqlEngine optionally attaches a caller-provided SPARQL engine over rdfjsStore. */
  createSparqlEngine?: (
    options: { store: rdfjs.Store },
  ) => SparqlEngineInterface;
}

/**
 * createLibsqlAdapterFromRdfjsStore assembles Client-facing quad/SPARQL facades over shared LibSQL infrastructure.
 */
export function createLibsqlAdapterFromRdfjsStore(
  options: LibsqlAdapterFromRdfjsStoreOptions,
): Adapter {
  const { patchSync, searchIndex } = options.infrastructure;
  const configuredSparqlEngine = options.createSparqlEngine?.({
    store: options.rdfjsStore,
  });

  const quadStore = new RdfjsQuadStore(options.rdfjsStore);

  return {
    quadStore: {
      export: (request) => quadStore.export(request),
      import: async (request) => {
        patchSync.beforeImport();
        const response = await quadStore.import(request);
        await options.commitPendingChanges();
        await patchSync.afterImport();
        return response;
      },
    },
    sparqlEngine: configuredSparqlEngine
      ? {
        execute: async (request) => {
          const response = await configuredSparqlEngine.execute(request);
          await options.commitPendingChanges();
          return response;
        },
      }
      : undefined,
    searchIndex,
  };
}
