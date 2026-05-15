import type { ClientInterface } from "@worlds/client";
import type { ExportRequest, ExportResponse, ImportRequest, ImportResponse } from "@worlds/client";
import type { SearchRequest, SearchResponse } from "@worlds/client";
import type { SparqlRequest, SparqlResponse } from "@worlds/client";

export interface FakeClientOptions {
  importResponse?: ImportResponse;
  exportResponse?: ExportResponse;
  searchResponse?: SearchResponse;
  sparqlResponse?: SparqlResponse;
  importError?: Error;
  exportError?: Error;
  searchError?: Error;
  sparqlError?: Error;
  onImport?: (request: ImportRequest) => void;
  onExport?: (request: ExportRequest) => void;
  onSearch?: (request: SearchRequest) => void;
  onSparql?: (request: SparqlRequest) => void;
}

export function createFakeClient(options: FakeClientOptions = {}): ClientInterface {
  return {
    async import(request: ImportRequest): Promise<ImportResponse> {
      options.onImport?.(request);
      if (options.importError) {
        throw options.importError;
      }
      return options.importResponse;
    },
    async export(request: ExportRequest): Promise<ExportResponse> {
      options.onExport?.(request);
      if (options.exportError) {
        throw options.exportError;
      }
      if (!options.exportResponse) {
        throw new Error("Missing fake export response");
      }
      return options.exportResponse;
    },
    async search(request: SearchRequest): Promise<SearchResponse> {
      options.onSearch?.(request);
      if (options.searchError) {
        throw options.searchError;
      }
      return options.searchResponse ?? { results: [] };
    },
    async sparql(request: SparqlRequest): Promise<SparqlResponse> {
      options.onSparql?.(request);
      if (options.sparqlError) {
        throw options.sparqlError;
      }
      if (!options.sparqlResponse) {
        throw new Error("Missing fake SPARQL response");
      }
      return options.sparqlResponse;
    },
  };
}
