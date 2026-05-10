import type * as rdfjs from "@rdfjs/types";
import type { ClientInterface } from "./interface.ts";
import type { ImportRequest, ImportResponse } from "#/client/rdf/import.ts";
import type { ExportRequest, ExportResponse } from "#/client/rdf/export.ts";
import type { SparqlRequest, SparqlResponse } from "#/client/rdf/sparql.ts";
import type { SearchRequest, SearchResponse } from "#/client/search/search.ts";

/**
 * ClientOptions are the options for the Client.
 */
export interface ClientOptions {
  getRdfjsStore(): Promise<rdfjs.Store>;
}

/**
 * Client is the client for the Worlds API.
 */
export class Client implements ClientInterface {
  public constructor(private readonly options: ClientOptions) {}

  public import(_request: ImportRequest): Promise<ImportResponse> {
    throw new Error("Method not implemented.");
  }

  public export(_request: ExportRequest): Promise<ExportResponse> {
    throw new Error("Method not implemented.");
  }

  public sparql(_request: SparqlRequest): Promise<SparqlResponse> {
    throw new Error("Method not implemented.");
  }

  public search(_request: SearchRequest): Promise<SearchResponse> {
    throw new Error("Method not implemented.");
  }
}
