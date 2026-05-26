import type { ClientInterface } from "./client-interface.ts";
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
  RebuildSearchIndexRequest,
  RebuildSearchIndexResponse,
  SearchIndexInterface,
  SearchRequest,
  SearchResponse,
} from "./search-index/mod.ts";

/**
 * Adapter details the aggregate internal subsystems powering active execution.
 */
export interface Adapter {
  /**
   * quadStore manages the ingestion and extraction of triple/quad data.
   */
  quadStore: QuadStoreInterface;

  /**
   * sparqlEngine evaluates declarative queries and updates against the graph.
   */
  sparqlEngine?: SparqlEngineInterface;

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
  public constructor(protected readonly adapter: Adapter) {}

  public async import(request: ImportRequest): Promise<ImportResponse> {
    return await this.adapter.quadStore.import(request);
  }

  public async export(request: ExportRequest): Promise<ExportResponse> {
    return await this.adapter.quadStore.export(request);
  }

  public async sparql(request: SparqlRequest): Promise<SparqlResponse> {
    if (!this.adapter.sparqlEngine) {
      throw new Error("SPARQL engine is not configured.");
    }

    return await this.adapter.sparqlEngine.execute(request);
  }

  public async search(request: SearchRequest): Promise<SearchResponse> {
    return await this.adapter.searchIndex.search(request);
  }

  public async rebuildSearchIndex(
    request?: RebuildSearchIndexRequest,
  ): Promise<RebuildSearchIndexResponse> {
    if (!this.adapter.searchIndex.rebuildSearchIndex) {
      throw new Error(
        "search index rebuild is only supported for LibSQL-backed clients",
      );
    }
    return await this.adapter.searchIndex.rebuildSearchIndex(request);
  }
}
