import type * as rdfjs from "@rdfjs/types";
import type { ClientInterface } from "./interface.ts";
import type { ImportRequest, ImportResponse } from "./import.ts";
import type { ExportRequest, ExportResponse } from "./export.ts";
import type { SparqlRequest, SparqlResponse } from "./sparql.ts";
import type { SearchRequest, SearchResponse } from "./search.ts";

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

  public async import(request: ImportRequest): Promise<ImportResponse> {
    throw new Error("Method not implemented.");
  }

  public async export(request: ExportRequest): Promise<ExportResponse> {
    throw new Error("Method not implemented.");
  }

  public async sparql(request: SparqlRequest): Promise<SparqlResponse> {
    throw new Error("Method not implemented.");
  }

  public async search(request: SearchRequest): Promise<SearchResponse> {
    throw new Error("Method not implemented.");
  }
}
