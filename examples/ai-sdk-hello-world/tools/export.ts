import { jsonSchema, tool } from "ai";
import type { ClientInterface, ExportRequest } from "@worlds/client";
import { wrapToolExecution } from "./utils.ts";

/**
 * SerializedExportRequest is a discriminated ExportRequest type that only allows "serialized" formats.
 */
export type SerializedExportRequest = Omit<ExportRequest, "format"> & {
  format: Extract<ExportRequest["format"], { kind: "serialized" }>;
};

/**
 * createExportRdfTool creates an AI SDK tool for exporting data from the knowledge base.
 *
 * @param client The Worlds ClientInterface instance.
 * @returns An AI SDK tool for exporting data from the knowledge base.
 */
export function createExportRdfTool(client: ClientInterface) {
  return tool({
    description:
      "Export the entire knowledge base graph as serialized RDF data (like Turtle or N-Triples). Use this as a safety hatch or when a full system dump is explicitly requested.",
    inputSchema: jsonSchema<SerializedExportRequest>({
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
    execute: (request) =>
      wrapToolExecution(async () => {
        if (
          request.format.kind === "serialized" && !request.format.contentType
        ) {
          request.format.contentType = "text/turtle";
        }
        const response = await client.export(request);
        return {
          data: response.kind === "serialized" ? response.data : null,
        };
      }),
  });
}
