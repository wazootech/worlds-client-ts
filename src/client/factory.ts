import { QueryEngine } from "@comunica/query-sparql-rdfjs-lite";
import { Store } from "n3";

import { Client, type ClientOptions } from "./client.ts";
import type { ClientInterface } from "./interface.ts";
import { createIndexedStore } from "./quad-store/indexed-store.ts";
import { RdfjsQuadStore } from "./quad-store/quad-store.ts";
import { ComunicaSparqlEngine } from "./sparql-engine/sparql-engine.ts";
import type { SearchIndexInterface } from "./search-index/mod.ts";
import type { Patch } from "./quad-store/patch.ts";
import type {
  ImportRequest,
  ImportResponse,
} from "./quad-store/mod.ts";
import type {
  SparqlRequest,
  SparqlResponse,
} from "./sparql-engine/mod.ts";

const queryEngine = new QueryEngine();

/**
 * SynchronizedClient is a wrapper around Client that automatically commits
 * changes to the database after each operation.
 */
export class SynchronizedClient extends Client {
  constructor(
    opts: ClientOptions,
    private readonly commitChanges: () => Promise<void>,
  ) {
    super(opts);
  }

  public override async import(
    request: ImportRequest,
  ): Promise<ImportResponse> {
    const res = await super.import(request);
    await this.commitChanges();
    return res;
  }

  public override async sparql(
    request: SparqlRequest,
  ): Promise<SparqlResponse> {
    const res = await super.sparql(request);
    await this.commitChanges();
    return res;
  }
}

/**
 * Configuration bundle for generating a reactive engine deployment.
 */
export interface BaseClientOptions {
  /** 
   * Primary semantic lookups engine powering natural language searches.
   */
  searchIndex: SearchIndexInterface;
  /** 
   * Inversion hook dispatching mutation sets to external durable storage agents.
   */
  sync?: (patch: Patch) => Promise<unknown>;
  /** 
   * Optional initializer reconstructing initial graph contents before activation.
   */
  hydrate?: (store: Store) => Promise<unknown>;
}

/**
 * createBaseClient synthesizes the generalized orchestration machinery required to power
 * any transactional reactive World environment. It intercepts memory mutations, cascades
 * commitment lifecycle events, and instantiates the semantic execution graph.
 */
export async function createBaseClient(
  options: BaseClientOptions,
): Promise<ClientInterface> {
  const rawStore = new Store();

  // Allow provider to pre-load graph dependencies.
  if (options.hydrate) {
    await options.hydrate(rawStore);
  }

  // Construct active monitoring bridge.
  const { store, queue } = createIndexedStore(rawStore);

  // Centralized coordinator aggregating diff streams for upstream emission.
  const commitChanges = async () => {
    const patches = queue.flush();
    if (patches.length === 0) return;
    
    if (options.sync) {
      const merged: Patch = {
        insertions: patches.flatMap((p) => p.insertions),
        deletions: patches.flatMap((p) => p.deletions),
      };
      await options.sync(merged);
    }
  };

  // Attach standard core runtime facilities.
  const quadStore = new RdfjsQuadStore(store);
  const sparqlEngine = new ComunicaSparqlEngine({
    store,
    queryEngine,
  });

  // Assemble final high-order active composition.
  const baseOptions: ClientOptions = {
    quadStore,
    sparqlEngine,
    searchIndex: options.searchIndex,
  };

  return new SynchronizedClient(baseOptions, commitChanges);
}
