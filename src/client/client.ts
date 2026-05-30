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
import type { ClientCapabilities } from "./client-capabilities.ts";

export type { ClientCapabilities };

/**
 * ClientInterface is the public contract for the Worlds API.
 */
export interface ClientInterface {
  /**
   * capabilities describes search topology when the factory sets it (materialized vs scan).
   */
  readonly capabilities?: ClientCapabilities;
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
   * reindex rebuilds the derived search index from durable quads when capabilities.searchIndexTopology is "materialized".
   * On scan topologies, reindex is a documented no-op unless an external index hook was wired at factory time.
   * @param request optional include/exclude scope and read page size.
   * @returns A promise that resolves to processed quad and chunk row counts.
   */
  reindex(request?: ReindexRequest): Promise<ReindexResponse>;
}

/**
 * ClientOptions wires quad, SPARQL, and search facades for custom assembly and tests.
 */
export interface ClientOptions {
  /** quadStore manages the ingestion and extraction of triple/quad data. */
  quadStore?: QuadStoreInterface;

  /** sparqlEngine evaluates declarative queries and updates against the graph. */
  sparqlEngine?: SparqlEngineInterface;

  /** searchIndex enables high-performance keyword search across the graph literals. */
  searchIndex?: SearchIndexInterface;

  /** capabilities documents search index topology for integrators when known at assembly time. */
  capabilities?: ClientCapabilities;
}

/**
 * Client synthesizes a Worlds API facade from wired quad, SPARQL, and search subsystems.
 */
export class Client implements ClientInterface {
  public readonly capabilities: ClientCapabilities | undefined;

  public constructor(
    private readonly options: ClientOptions,
  ) {
    this.capabilities = options.capabilities;
  }

  public import(request: ImportRequest): Promise<void> {
    if (!this.options.quadStore) {
      throw new Error("Quad store is not configured.");
    }
    return this.options.quadStore.import(request);
  }

  public export(request: ExportRequest): Promise<ExportResponse> {
    if (!this.options.quadStore) {
      throw new Error("Quad store is not configured.");
    }
    return this.options.quadStore.export(request);
  }

  public async sparql(request: SparqlRequest): Promise<SparqlResponse> {
    if (!this.options.sparqlEngine) {
      throw new Error("SPARQL engine is not configured.");
    }
    return await this.options.sparqlEngine.execute(request);
  }

  public search(request: SearchRequest): Promise<SearchResponse> {
    if (!this.options.searchIndex) {
      throw new Error("Search index is not configured.");
    }
    return this.options.searchIndex.search(request);
  }

  public reindex(request?: ReindexRequest): Promise<ReindexResponse> {
    if (!this.options.searchIndex) {
      throw new Error("Search index is not configured.");
    }
    return this.options.searchIndex.reindex(request);
  }
}
