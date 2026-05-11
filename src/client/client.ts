import type * as rdfjs from "@rdfjs/types";
import type { ClientInterface } from "./interface.ts";
import type {
  ExportRequest,
  ExportResponse,
  ImportRequest,
  ImportResponse,
} from "./import-export.ts";
import type { SparqlRequest, SparqlResponse } from "./sparql.ts";
import type {
  SearchRequest,
  SearchResponse,
  SearchServiceInterface,
} from "./search.ts";

import { executeExport, executeImport } from "./import-export.ts";
import { executeSparql } from "./sparql.ts";
import { DefaultSearchService, executeSearch } from "./search.ts";

/**
 * ClientOptions are the options for the Client.
 */
export interface ClientOptions {
  /**
   * store is the RDFJS store that the client will use to store and retrieve data.
   */
  store: rdfjs.Store;

  /**
   * searchService is the search service that the client will use to search the store.
   */
  searchService?: SearchServiceInterface;
}

/**
 * Client is the client for the Worlds API.
 */
export class Client implements ClientInterface {
  public constructor(private readonly options: ClientOptions) {
    this.options.searchService ??= new DefaultSearchService(options.store);
  }

  public async import(request: ImportRequest): Promise<ImportResponse> {
    return await executeImport(this.options.store, request);
  }

  public async export(request: ExportRequest): Promise<ExportResponse> {
    return await executeExport(this.options.store, request);
  }

  public async sparql(request: SparqlRequest): Promise<SparqlResponse> {
    return await executeSparql(this.options.store, request);
  }

  public async search(request: SearchRequest): Promise<SearchResponse> {
    if (this.options.searchService) {
      return await this.options.searchService.search(request);
    }

    return await executeSearch(this.options.store, request);
  }
}
