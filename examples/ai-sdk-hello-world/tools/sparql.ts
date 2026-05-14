import type { CoreTool } from "ai";
import { jsonSchema, tool } from "ai";
import type { ClientInterface, SparqlRequest } from "@worlds/client";

export interface ExecuteSparqlOptions {
  allowUpdates?: boolean;
}

export function createExecuteSparqlTool(
  client: ClientInterface,
  options?: ExecuteSparqlOptions,
): CoreTool {
  return tool({
    description:
      "Execute a SPARQL query against the knowledge base. Use this for complex, precise relational queries across the RDF graph.",
    parameters: jsonSchema<SparqlRequest>({
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The raw SPARQL query string (SELECT or ASK).",
        },
        baseIri: {
          type: "string",
          description: "Base IRI for the query execution.",
        },
        timeoutMs: {
          type: "number",
          description:
            "Query timeout in milliseconds (defaults to 30 seconds).",
        },
      },
      required: ["query"],
    }),
    execute: async (request) => {
      if (options?.allowUpdates === false) {
        if (/\b(INSERT|DELETE|DROP|CLEAR|LOAD|CREATE)\b/i.test(request.query)) {
          return {
            success: false,
            error:
              "SPARQL updates are disabled for this agent. Please only execute SELECT or ASK queries.",
          };
        }
      }

      try {
        const response = await client.sparql(request);
        return {
          success: true,
          data: response.kind === "void" ? null : response.data,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  });
}
