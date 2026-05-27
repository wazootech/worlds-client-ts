import type {
  ExportRequest,
  ExportResponse,
  ImportRequest,
} from "./quad-store/mod.ts";
import type {
  RebuildSearchIndexRequest,
  RebuildSearchIndexResponse,
  SearchRequest,
  SearchResponse,
} from "./search-index/mod.ts";
import type { SparqlRequest, SparqlResponse } from "./sparql-engine/mod.ts";

/**
 * ClientInterface is the client interface for the Worlds API.
 */
export interface ClientInterface {
  /**
   * import imports data into the Worlds API.
   * @param request The import request body.
   * @returns A promise that resolves to the import response.
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
   * rebuildSearchIndex rebuilds the derived search index from durable quads (LibSQL clients only).
   * @param request optional include/exclude scope and read page size.
   * @returns A promise that resolves to processed quad and chunk row counts.
   */
  rebuildSearchIndex(
    request?: RebuildSearchIndexRequest,
  ): Promise<RebuildSearchIndexResponse>;
}
