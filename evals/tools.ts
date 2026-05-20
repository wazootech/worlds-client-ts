import type { Client } from "@worlds/client";
import { tool } from "ai";
import { z } from "zod";

/** isReadOnlySparqlQuery reports whether a query begins with an allowed read-only form. */
export function isReadOnlySparqlQuery(query: string): boolean {
  const normalizedQuery = query.trim().replace(/^(?:#.*\n\s*)+/, "");
  return /^(SELECT|ASK)\b/i.test(normalizedQuery);
}

/** createEvalTools creates the isolated tool set used by the Deno eval harness. */
export function createEvalTools(client: Client) {
  return {
    searchWorld: tool({
      description:
        "Search the knowledge base for semantic statements or documents that match a query. Use this to find information about any entities or subjects in the graph.",
      inputSchema: z.object({
        query: z.string().describe("The text query or keywords to search for."),
      }),
      execute: async (request: { query: string }) => {
        try {
          const response = await client.search(request);
          return {
            success: true,
            ...response,
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      },
    }),
    executeSparql: tool({
      description:
        "Execute a SPARQL query against the knowledge base. Use this for complex, precise relational queries across the RDF graph.",
      inputSchema: z.object({
        query: z.string().describe(
          "The raw SPARQL query string (SELECT or ASK).",
        ),
        baseIri: z.string().optional().describe(
          "Base IRI for the query execution.",
        ),
        timeoutMs: z.number().optional().describe(
          "Query timeout in milliseconds (defaults to 30 seconds).",
        ),
      }),
      execute: async (
        request: { query: string; baseIri?: string; timeoutMs?: number },
      ) => {
        if (!isReadOnlySparqlQuery(request.query)) {
          return {
            success: false,
            error:
              "Only read-only SPARQL queries are allowed for this agent. Please use SELECT or ASK.",
          };
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
    }),
  };
}
