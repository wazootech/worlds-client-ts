import { tool } from "ai";
import type { ClientInterface } from "@worlds/client";
import type {
  SearchRequest,
  SearchResponse,
} from "@worlds/client/search-index";
import { z } from "zod";

/**
 * createSearchWorldTool creates an AI SDK tool for searching the knowledge base.
 *
 * @param client The Worlds ClientInterface instance.
 * @returns An AI SDK tool for searching the knowledge base.
 */
export function createSearchWorldTool(client: ClientInterface) {
  return tool({
    description:
      "Discovery search: find subject IRIs and matching predicate/graph context for a natural-language query. Results expose subject and predicate for follow-up SPARQL disambiguation — do not treat search text alone as ground-truth facts.",
    inputSchema: z.object({
      query: z.string().describe("The text query or keywords to search for."),
      include: z.object({
        subjects: z.array(z.string()).optional().describe(
          "Restricts matching to specific subject IRIs.",
        ),
        predicates: z.array(z.string()).optional().describe(
          "Restricts matching to specific predicate IRIs.",
        ),
        graphs: z.array(z.string()).optional().describe(
          "Restricts matching to specific Named Graphs.",
        ),
      }).optional().describe(
        "Positive boundary conditions. Facts MUST satisfy all declared constraints.",
      ),
      exclude: z.object({
        subjects: z.array(z.string()).optional().describe(
          "Rejects specific subject IRIs.",
        ),
        predicates: z.array(z.string()).optional().describe(
          "Rejects specific predicate IRIs.",
        ),
        graphs: z.array(z.string()).optional().describe(
          "Rejects specific Named Graphs.",
        ),
      }).optional().describe(
        "Negative boundary conditions. Facts matching ANY constraint are rejected.",
      ),
    }),
    execute: async (
      request: SearchRequest,
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
