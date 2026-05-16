import { jsonSchema, tool } from "ai";
import type { ClientInterface, ImportRequest } from "@worlds/client";
import { wrapToolExecution } from "./utils.ts";

/**
 * SerializedImportRequest is a discriminated ImportRequest type that only allows "serialized" sources.
 */
export type SerializedImportRequest = Omit<ImportRequest, "source"> & {
  source: Extract<ImportRequest["source"], { kind: "serialized" }>;
};

/**
 * createImportRdfTool creates an AI SDK tool for importing data into the knowledge base.
 *
 * @param client The Worlds ClientInterface instance.
 * @returns An AI SDK tool for importing data into the knowledge base.
 */
export function createImportRdfTool(client: ClientInterface) {
  return tool({
    description:
      "Import serialized RDF data (like Turtle or N-Triples) into the knowledge base. Useful for storing new factual statements or relations.",
    inputSchema: jsonSchema<SerializedImportRequest>({
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
    execute: (request) =>
      wrapToolExecution(async () => {
        if (
          request.source.kind === "serialized" && !request.source.contentType
        ) {
          request.source.contentType = "text/turtle";
        }
        await client.import(request);
        return {
          message: "Data imported successfully.",
        };
      }),
  });
}
