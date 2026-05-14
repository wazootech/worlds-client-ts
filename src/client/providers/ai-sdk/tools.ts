import type { ClientInterface } from "#/client/mod.ts";
import type { CoreTool } from "ai";
import {
  createExecuteSparqlTool,
  createExportRdfTool,
  createImportRdfTool,
  createSearchWorldTool,
} from "./tools/mod.ts";
import type { ExecuteSparqlOptions } from "./tools/sparql.ts";

/**
 * AiSdkToolsOptions defines the configuration options for the AI SDK tools.
 */
export interface AiSdkToolsOptions {
  /**
   * sparql provides configuration overrides specifically targeting the executeSparql tool.
   */
  sparql?: ExecuteSparqlOptions;
}

/**
 * createTools creates AI SDK compatible tools that interact with a Worlds ClientInterface.
 *
 * @param client The Worlds ClientInterface instance.
 * @param options Configuration options for the provided tools.
 * @returns An object containing the AI SDK tools.
 */
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
