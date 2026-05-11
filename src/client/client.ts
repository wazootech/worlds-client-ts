import type { ClientInterface } from "./interface.ts";
import type {
  ExportRequest,
  ExportResponse,
  ImportRequest,
  ImportResponse,
  QuadStoreInterface,
} from "./quad-store/mod.ts";
import type {
  SparqlEngineInterface,
  SparqlRequest,
  SparqlResponse,
} from "./sparql-engine/mod.ts";
import type {
  SearchIndexInterface,
  SearchRequest,
  SearchResponse,
} from "./search-index/mod.ts";

/**
 * ClientOptions are the options for the Client.
 */
export interface ClientOptions {
  /**
   * quadStore manages the ingestion and extraction of triple/quad data.
   */
  quadStore: QuadStoreInterface;

  /**
   * sparqlEngine evaluates declarative queries and updates against the graph.
   */
  sparqlEngine: SparqlEngineInterface;

  /**
   * searchIndex enables high-performance keyword search across the graph literals.
   */
  searchIndex: SearchIndexInterface;
}

/**
 * Client is the standard gateway client for the Worlds API.
 * It aggregates the specialized capabilities for data persistence,
 * declarative querying, and fuzzy searching.
 */
export class Client implements ClientInterface {
  public constructor(private readonly options: ClientOptions) {}

  public async import(request: ImportRequest): Promise<ImportResponse> {
    return await this.options.quadStore.import(request);
  }

  public async export(request: ExportRequest): Promise<ExportResponse> {
    return await this.options.quadStore.export(request);
  }

  public async sparql(request: SparqlRequest): Promise<SparqlResponse> {
    return await this.options.sparqlEngine.execute(request);
  }

  public async search(request: SearchRequest): Promise<SearchResponse> {
    return await this.options.searchIndex.search(request);
  }
}
