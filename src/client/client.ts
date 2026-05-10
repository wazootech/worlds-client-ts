import type * as rdfjs from "@rdfjs/types";
import type { ClientInterface } from "./interface.ts";
import type { ImportRequest, ImportResponse } from "#/client/rdf/import.ts";
import type { ExportRequest, ExportResponse } from "#/client/rdf/export.ts";
import type { SparqlRequest, SparqlResponse } from "#/client/rdf/sparql.ts";
import type { SearchRequest, SearchResponse } from "#/client/search/search.ts";

import { executeImport } from "#/client/rdf/import.ts";
import { executeExport } from "#/client/rdf/export.ts";
import { executeSparql } from "#/client/rdf/sparql.ts";

import { executeSearch } from "#/client/search/search.ts";

/**
 * ClientOptions are the options for the Client.
 */
export interface ClientOptions {
  /**
   * getRdfjsStore is a function that provides the client with access to an
   * RDFJS store.
   */
  getRdfjsStore(): Promise<rdfjs.Store>;
}

/**
 * Client is the client for the Worlds API.
 */
export class Client implements ClientInterface {
  public constructor(private readonly options: ClientOptions) {}

  public async import(request: ImportRequest): Promise<ImportResponse> {
    const store = await this.options.getRdfjsStore();
    return await executeImport(store, request);
  }

  public async export(request: ExportRequest): Promise<ExportResponse> {
    const store = await this.options.getRdfjsStore();
    return await executeExport(store, request);
  }

  public async sparql(request: SparqlRequest): Promise<SparqlResponse> {
    const store = await this.options.getRdfjsStore();
    return await executeSparql(store, request);
  }

  public async search(request: SearchRequest): Promise<SearchResponse> {
    const store = await this.options.getRdfjsStore();
    return await executeSearch(store, request);
  }
}
