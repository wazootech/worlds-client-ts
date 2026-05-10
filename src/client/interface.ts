import type { ImportRequest, ImportResponse } from "./import.ts";
import type { ExportRequest, ExportResponse } from "./export.ts";
import type { SparqlRequest, SparqlResponse } from "./sparql.ts";
import type { SearchRequest, SearchResponse } from "./search.ts";

/**
 * ClientInterface is the client interface for the Worlds API.
 */
export interface ClientInterface {
  /**
   * Imports data into the Worlds API.
   * @param request The import request body.
   * @returns A promise that resolves to the import response.
   */
  import(request: ImportRequest): Promise<ImportResponse>;

  /**
   * Exports data from the Worlds API.
   * @param request The export request body.
   * @returns A promise that resolves to the export response.
   */
  export(request: ExportRequest): Promise<ExportResponse>;

  /**
   * Executes a SPARQL query or update against the RDF store.
   * @param request The SPARQL request body.
   * @returns A promise that resolves to the SPARQL response.
   */
  sparql(request: SparqlRequest): Promise<SparqlResponse>;

  /**
   * Searches the Worlds API.
   * @param request The search request body.
   * @returns A promise that resolves to the search response.
   */
  search(request: SearchRequest): Promise<SearchResponse>;
}
