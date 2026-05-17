import { assertEquals } from "@std/assert";
import { createExportRdfTool } from "./export.ts";
import { createFakeClient } from "./test-client.ts";

Deno.test("createExportRdfTool defaults serialized contentType to text/turtle", async () => {
  let observedContentType: string | undefined;
  const toolInstance = createExportRdfTool(createFakeClient({
    exportResponse: {
      kind: "serialized",
      data: "@prefix ex: <http://example.org/> .",
      contentType: "text/turtle",
    },
    onExport(request) {
      if (request.format.kind === "serialized") {
        observedContentType = request.format.contentType;
      }
    },
  }));
  const response = await toolInstance.execute!({
    format: {
      kind: "serialized",
    },
  }, { toolCallId: "export-1", messages: [] });

  assertEquals(observedContentType, "text/turtle");
  assertEquals(response, {
    success: true,
    data: "@prefix ex: <http://example.org/> .",
  });
});

Deno.test("createExportRdfTool returns safe failure on client error", async () => {
  const toolInstance = createExportRdfTool(
    createFakeClient({ exportError: new Error("export failed") }),
  );
  const response = await toolInstance.execute!({
    format: {
      kind: "serialized",
    },
  }, { toolCallId: "export-2", messages: [] });

  assertEquals(response, {
    success: false,
    error: "export failed",
  });
});
