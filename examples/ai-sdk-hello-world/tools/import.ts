import type { CoreTool } from "ai";
import { jsonSchema, tool } from "ai";
import type { ClientInterface, ImportRequest } from "@worlds/client";

export type SerializedImportRequest = Omit<ImportRequest, "source"> & {
  source: Extract<ImportRequest["source"], { kind: "serialized" }>;
};

export function createImportRdfTool(client: ClientInterface): CoreTool {
  return tool({
    description:
      "Import serialized RDF data (like Turtle or N-Triples) into the knowledge base. Useful for storing new factual statements or relations.",
    parameters: jsonSchema<SerializedImportRequest>({
      type: "object",
      properties: {
        mode: {
          type: "string",
          enum: ["merge", "replace"],
          description: "Mode of import (defaults to 'merge').",
        },
        source: {
          type: "object",
          properties: {
            kind: {
              type: "string",
              enum: ["serialized"],
              description: "The kind of data source. Always use 'serialized'.",
            },
            data: {
              type: "string",
              description: "The serialized RDF data to import.",
            },
            contentType: {
              type: "string",
              description:
                "The MIME type of the data. Usually 'text/turtle' or 'application/n-triples'.",
            },
          },
          required: ["kind", "data"],
        },
      },
      required: ["source"],
    }),
    execute: async (request) => {
      try {
        if (
          request.source.kind === "serialized" && !request.source.contentType
        ) {
          request.source.contentType = "text/turtle";
        }
        await client.import(request);
        return {
          success: true,
          message: "Data imported successfully.",
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
