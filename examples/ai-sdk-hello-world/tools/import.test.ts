import { assertEquals } from "@std/assert";
import { createImportRdfTool } from "./import.ts";
import { createFakeClient } from "./test-client.ts";

Deno.test("createImportRdfTool defaults serialized contentType to text/turtle", async () => {
  let observedContentType: string | undefined;
  const toolInstance = createImportRdfTool(createFakeClient({
    onImport(request) {
      if (request.source.kind === "serialized") {
        observedContentType = request.source.contentType;
      }
    },
  }));

  const response = await toolInstance.execute!({
    source: {
      kind: "serialized",
      data: "@prefix ex: <http://example.org/> .",
    },
  }, { toolCallId: "import-1", messages: [] });

  assertEquals(observedContentType, "text/turtle");
  assertEquals(response, {
    success: true,
    message: "Data imported successfully.",
  });
});

Deno.test("createImportRdfTool returns safe failure on client error", async () => {
  const toolInstance = createImportRdfTool(createFakeClient({ importError: new Error("import failed") }));
  const response = await toolInstance.execute!({
    source: {
      kind: "serialized",
      data: "broken",
    },
  }, { toolCallId: "import-2", messages: [] });

  assertEquals(response, {
    success: false,
    error: "import failed",
  });
});
