import type { CoreTool } from "ai";
import { jsonSchema, tool } from "ai";
import type { ClientInterface, ExportRequest } from "@worlds/client";

export type SerializedExportRequest = Omit<ExportRequest, "format"> & {
  format: Extract<ExportRequest["format"], { kind: "serialized" }>;
};

export function createExportRdfTool(client: ClientInterface): CoreTool {
  return tool({
    description:
      "Export the entire knowledge base graph as serialized RDF data (like Turtle or N-Triples). Use this as a safety hatch or when a full system dump is explicitly requested.",
    parameters: jsonSchema<SerializedExportRequest>({
      type: "object",
      properties: {
        format: {
          type: "object",
          properties: {
            kind: {
              type: "string",
              enum: ["serialized"],
              description: "Desired output format.",
            },
            contentType: {
              type: "string",
              description:
                "The MIME type of the exported data. Usually 'text/turtle' or 'application/n-triples'.",
            },
          },
          required: ["kind"],
        },
      },
      required: ["format"],
    }),
    execute: async (request) => {
      try {
        if (
          request.format.kind === "serialized" && !request.format.contentType
        ) {
          request.format.contentType = "text/turtle";
        }
        const response = await client.export(request);
        return {
          success: true,
          data: response.kind === "serialized" ? response.data : null,
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
