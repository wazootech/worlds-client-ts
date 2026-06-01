import { Client } from "@/client/client.ts";
import type { ClientInterface } from "@/client/client.ts";
import type { SearchIndexInterface } from "@/client/search-index/mod.ts";
import type { CommitHandler } from "@/client/quad-store/mod.ts";
import type { ComunicaQueryEngine } from "@/client/adapters/comunica/mod.ts";
import { ComunicaSparqlEngine } from "@/client/adapters/comunica/mod.ts";
import type * as rdfjs from "@rdfjs/types";
import { BufferedRdfjsQuadStore } from "./buffered-rdfjs-quad-store.ts";
import { Transaction } from "./transaction.ts";

/**
 * AdapterClientOptions provides all the concrete subsystems needed to automatically
 * wire a BufferedRdfjsQuadStore, ComunicaSparqlEngine, and search index into a Client facade.
 */
export interface AdapterClientOptions {
  /** The fully constructed adapter-specific SearchIndex implementation. */
  searchIndex: SearchIndexInterface;

  /** The read-only, durable RDF/JS Store source (e.g. LibsqlRdfjsStore or DenokvRdfjsStore). */
  store: rdfjs.Store;

  /** The handler that accepts flushed patches to write them safely to the backend. */
  commit: CommitHandler;

  /** An optional Comunica query engine enabling SPARQL queries across the store. */
  queryEngine?: ComunicaQueryEngine;
}

/**
 * createClient is a shared factory function that wires an adapter's explicit
 * read models (RdfjsStore, SearchIndex) and mutative logic (CommitHandler) into
 * the unified Client facade.
 *
 * It automatically wraps the readSource inside a BufferedRdfjsQuadStore to provide
 * the QuadStoreInterface for client.import(), and seamlessly hooks up Comunica to
 * execute SPARQL updates via a bridged transactionFactory.
 */
export function createClient(
  options: AdapterClientOptions,
): ClientInterface {
  const quadStore = new BufferedRdfjsQuadStore({
    store: options.store,
    createTransaction: () =>
      new Transaction({
        commit: options.commit,
      }),
  });

  const sparqlEngine = options.queryEngine
    ? new ComunicaSparqlEngine({
      queryEngine: options.queryEngine,
      store: options.store,
      createTransaction: () =>
        new Transaction({
          commit: options.commit,
        }),
    })
    : undefined;

  return new Client({
    quadStore,
    searchIndex: options.searchIndex,
    sparqlEngine,
  });
}
