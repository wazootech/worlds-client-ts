import type { ClientInterface } from "./client-interface.ts";
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
  RebuildSearchIndexRequest,
  RebuildSearchIndexResponse,
  SearchIndexInterface,
  SearchRequest,
  SearchResponse,
} from "./search-index/mod.ts";

/**
 * Client is the standard gateway client for the Worlds API.
 * It aggregates the specialized capabilities for data persistence,
 * declarative querying, and fuzzy searching.
 */
export class Client implements ClientInterface {
  public constructor(
    private readonly quadStore: QuadStoreInterface,
    private readonly searchIndex: SearchIndexInterface,
    private readonly sparqlEngine?: SparqlEngineInterface,
  ) {}

  public async import(request: ImportRequest): Promise<void> {
    return await this.quadStore.import(request);
  }

  public async export(request: ExportRequest): Promise<ExportResponse> {
    return await this.quadStore.export(request);
  }

  public async sparql(request: SparqlRequest): Promise<SparqlResponse> {
    if (!this.sparqlEngine) {
      throw new Error("SPARQL engine is not configured.");
    }

    return await this.sparqlEngine.sparql(request);
  }

  public async search(request: SearchRequest): Promise<SearchResponse> {
    return await this.searchIndex.search(request);
  }

  public async rebuildSearchIndex(
    request?: RebuildSearchIndexRequest,
  ): Promise<RebuildSearchIndexResponse> {
    if (!this.searchIndex.rebuildSearchIndex) {
      throw new Error(
        "search index rebuild is only supported for LibSQL-backed clients",
      );
    }
    return await this.searchIndex.rebuildSearchIndex(request);
  }
}
