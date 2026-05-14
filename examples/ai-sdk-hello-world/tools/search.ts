import type { CoreTool } from "ai";
import { jsonSchema, tool } from "ai";
import type {
  ClientInterface,
  SearchRequest,
  SearchResponse,
} from "@worlds/client";

/**
 * createSearchWorldTool creates an AI SDK tool for searching the knowledge base.
 *
 * @param client The Worlds ClientInterface instance.
 * @returns An AI SDK tool for searching the knowledge base.
 */
export function createSearchWorldTool(client: ClientInterface): CoreTool {
  return tool({
    description:
      "Search the knowledge base for semantic statements or documents that match a query. Use this to find information about any entities or subjects in the graph.",
    parameters: jsonSchema<SearchRequest>({
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The text query or keywords to search for.",
        },
        include: {
          type: "object",
          description:
            "Positive boundary conditions. Facts MUST satisfy all declared constraints.",
          properties: {
            subjects: {
              type: "array",
              items: { type: "string" },
              description: "Restricts matching to specific subject IRIs.",
            },
            predicates: {
              type: "array",
              items: { type: "string" },
              description: "Restricts matching to specific predicate IRIs.",
            },
            graphs: {
              type: "array",
              items: { type: "string" },
              description: "Restricts matching to specific Named Graphs.",
            },
          },
        },
        exclude: {
          type: "object",
          description:
            "Negative boundary conditions. Facts matching ANY constraint are rejected.",
          properties: {
            subjects: {
              type: "array",
              items: { type: "string" },
              description: "Rejects specific subject IRIs.",
            },
            predicates: {
              type: "array",
              items: { type: "string" },
              description: "Rejects specific predicate IRIs.",
            },
            graphs: {
              type: "array",
              items: { type: "string" },
              description: "Rejects specific Named Graphs.",
            },
          },
        },
      },
      required: ["query"],
    }),
    execute: async (
      request,
    ): Promise<
      | ({ success: true } & SearchResponse)
      | { success: false; error: string }
    > => {
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
  });
}
