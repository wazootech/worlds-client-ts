import type {
  ExportRequest,
  ExportResponse,
  ImportRequest,
  QuadStoreInterface,
} from "./quad-store/mod.ts";
import type {
  SparqlEngineInterface,
  SparqlRequest,
  SparqlResponse,
} from "./sparql-engine/mod.ts";
import type {
  ReindexRequest,
  ReindexResponse,
  SearchIndexInterface,
  SearchRequest,
  SearchResponse,
} from "./search-index/mod.ts";

/**
 * Client is the public contract for the Worlds API.
 */
export interface Client {
  /**
   * import imports data into the Worlds API.
   * @param request The import request body.
   * @returns A promise that resolves when import completes.
   */
  import(request: ImportRequest): Promise<void>;

  /**
   * export exports data from the Worlds API.
   * @param request The export request body.
   * @returns A promise that resolves to the export response.
   */
  export(request: ExportRequest): Promise<ExportResponse>;

  /**
   * sparql executes a SPARQL query or update against the RDF store.
   * @param request The SPARQL request body.
   * @returns A promise that resolves to the SPARQL response.
   */
  sparql(request: SparqlRequest): Promise<SparqlResponse>;

  /**
   * search searches the RDF store for the given query.
   * @param request The search request body.
   * @returns A promise that resolves to the search response.
   */
  search(request: SearchRequest): Promise<SearchResponse>;

  /**
   * reindex rebuilds the derived search index from durable quads where supported.
   * @param request optional include/exclude scope and read page size.
   * @returns A promise that resolves to processed quad and chunk row counts.
   */
  reindex(request?: ReindexRequest): Promise<ReindexResponse>;
}

/**
 * ClientDependencies wires quad, SPARQL, and search facades for custom assembly and tests.
 */
export interface ClientDependencies {
  /** quadStore manages the ingestion and extraction of triple/quad data. */
  quadStore: QuadStoreInterface;

  /** sparqlEngine evaluates declarative queries and updates against the graph. */
  sparqlEngine?: SparqlEngineInterface;

  /** searchIndex enables high-performance keyword search across the graph literals. */
  searchIndex: SearchIndexInterface;
}

/**
 * createClientFromDependencies synthesizes a Client from wired subsystems.
 */
export function createClientFromDependencies(
  dependencies: ClientDependencies,
): Client {
  return {
    import: (request) => dependencies.quadStore.import(request),
    export: (request) => dependencies.quadStore.export(request),
    sparql: async (request) => {
      if (!dependencies.sparqlEngine) {
        throw new Error("SPARQL engine is not configured.");
      }
      return await dependencies.sparqlEngine.execute(request);
    },
    search: (request) => dependencies.searchIndex.search(request),
    reindex: (request) => dependencies.searchIndex.reindex(request),
  };
}
