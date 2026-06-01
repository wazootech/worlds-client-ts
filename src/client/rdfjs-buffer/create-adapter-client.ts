import { Client } from "@/client/client.ts";
import type { ClientInterface } from "@/client/client.ts";
import type { SearchIndexInterface } from "@/client/search-index/mod.ts";
import type { CommitHandler } from "@/client/quad-store/mod.ts";
import type { ComunicaQueryEngine } from "@/client/adapters/comunica/mod.ts";
import { ComunicaSparqlEngine } from "@/client/adapters/comunica/mod.ts";
import type * as rdfjs from "@rdfjs/types";
import { BufferedRdfjsQuadStore } from "./buffered-rdfjs-quad-store.ts";
import { createBufferedQuadTransaction } from "./quad-transaction.ts";

/**
 * AdapterClientOptions provides all the concrete subsystems needed to automatically
 * wire a BufferedRdfjsQuadStore, ComunicaSparqlEngine, and search index into a Client facade.
 */
export interface AdapterClientOptions {
  /** The fully constructed adapter-specific SearchIndex implementation. */
  searchIndex: SearchIndexInterface;

  /** The read-only, durable RDF/JS Store source (e.g. LibsqlRdfjsStore or DenokvRdfjsStore). */
  readSource: rdfjs.Store;

  /** The handler that accepts flushed patches to write them safely to the backend. */
  commitHandler: CommitHandler;

  /** An optional Comunica query engine enabling SPARQL queries across the readSource. */
  queryEngine?: ComunicaQueryEngine;
}

/**
 * createAdapterClient is a shared factory function that wires an adapter's explicit
 * read models (RdfjsStore, SearchIndex) and mutative logic (CommitHandler) into
 * the unified Client facade.
 *
 * It automatically wraps the readSource inside a BufferedRdfjsQuadStore to provide
 * the QuadStoreInterface for client.import(), and seamlessly hooks up Comunica to
 * execute SPARQL updates via a bridged transactionFactory.
 */
export function createAdapterClient(
  options: AdapterClientOptions,
): ClientInterface {
  const transactionFactory = () => {
    return createBufferedQuadTransaction({
      commitHandler: options.commitHandler,
    });
  };

  const quadStore = new BufferedRdfjsQuadStore({
    readSource: options.readSource,
    transactionFactory,
  });

  const sparqlEngine = options.queryEngine
    ? new ComunicaSparqlEngine({
      queryEngine: options.queryEngine,
      readSource: options.readSource,
      transactionFactory,
    })
    : undefined;

  return new Client({
    quadStore,
    searchIndex: options.searchIndex,
    sparqlEngine,
  });
}
