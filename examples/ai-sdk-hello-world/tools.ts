import type { ClientInterface } from "@worlds/client";
import type { CoreTool } from "ai";
import {
  createExecuteSparqlTool,
  createExportRdfTool,
  createImportRdfTool,
  createSearchWorldTool,
} from "./tools/mod.ts";
import type { ExecuteSparqlOptions } from "./tools/sparql.ts";

export interface AiSdkToolsOptions {
  sparql?: ExecuteSparqlOptions;
}

export function createTools(
  client: ClientInterface,
  options?: AiSdkToolsOptions,
): {
  searchWorld: CoreTool;
  executeSparql: CoreTool;
  importRdf: CoreTool;
  exportRdf: CoreTool;
} {
  return {
    searchWorld: createSearchWorldTool(client),
    executeSparql: createExecuteSparqlTool(client, options?.sparql),
    importRdf: createImportRdfTool(client),
    exportRdf: createExportRdfTool(client),
  };
}
