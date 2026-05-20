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
        "Search the RDF knowledge graph for labels, keywords, and semantic statements. Use this first to discover candidate subject URIs. Pass discovered subject values into executeSparql instead of inventing URIs.",
      inputSchema: z.object({
        query: z.string().describe(
          "Exact label, keyword, or natural-language phrase to search for.",
        ),
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
        "Execute a read-only SPARQL SELECT or ASK query against the RDF graph. Use this after searchWorld to traverse exact predicates and return grounded binding values. Final answers should preserve literal binding values exactly.",
      inputSchema: z.object({
        query: z.string().describe(
          "The raw read-only SPARQL query string. Only SELECT and ASK are allowed.",
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
