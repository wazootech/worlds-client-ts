import { jsonSchema, tool } from "ai";
import type { ClientInterface, SparqlRequest } from "@worlds/client";
import { translate } from "sparqlalgebrajs";

/**
 * ExecuteSparqlOptions defines the configuration options for the executeSparql tool.
 */
export interface ExecuteSparqlOptions {
  /**
   * allowUpdates controls whether the tool permits SPARQL UPDATE operations (e.g., INSERT, DELETE).
   * @default true
   */
  allowUpdates?: boolean;
}

/**
 * validateSparqlSyntax checks the SPARQL query string for syntax errors using the SPARQL algebra parser.
 * Returns a clear error message on failure, or null on success.
 * The parser distinguishes SPARQL syntax errors from other failures so the model
 * can retry with corrected syntax. Syntax errors are intentionally prefixed with
 * "SPARQL syntax error:" for easy detection in tool selection evals.
 */
function validateSparqlSyntax(query: string): string | null {
  try {
    translate(query);
    return null;
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : String(error);
    return `SPARQL syntax error: ${rawMessage}`;
  }
}

/**
 * createExecuteSparqlTool creates an AI SDK tool for executing SPARQL queries against the knowledge base.
 *
 * @param client The Worlds ClientInterface instance.
 * @param options Configuration options for the tool.
 * @returns An AI SDK tool for executing SPARQL queries against the knowledge base.
 */
export function createExecuteSparqlTool(
  client: ClientInterface,
  options?: ExecuteSparqlOptions,
) {
  return tool({
    description:
      "Execute a SPARQL query against the knowledge base. Returns empty data if the query matches no triples. Do not infer or fabricate information that is not present in the result set. Use this for complex, precise relational queries across the RDF graph.",
    inputSchema: jsonSchema<SparqlRequest>({
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

      const syntaxError = validateSparqlSyntax(request.query);
      if (syntaxError !== null) {
        return {
          success: false,
          error: syntaxError,
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
  });
}
