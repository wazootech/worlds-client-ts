import { assertEquals } from "@std/assert";
import { createSearchWorldTool } from "./search.ts";
import { createFakeClient } from "./test-client.ts";

function assertNonStreamResponse(response: unknown): asserts response is Record<string, unknown> {
  if (
    typeof response !== "object" ||
    response === null ||
    Symbol.asyncIterator in response
  ) {
    throw new Error("Expected non-stream tool response");
  }
}

Deno.test("createSearchWorldTool returns no-match success message", async () => {
  const toolInstance = createSearchWorldTool(createFakeClient({ searchResponse: { results: [] } }));
  const rawResponse: unknown = await toolInstance.execute!({ query: "missing" }, { toolCallId: "search-1", messages: [] });
  assertNonStreamResponse(rawResponse);
  if (rawResponse.success !== true || !Array.isArray(rawResponse.results)) {
    throw new Error("Expected successful search response");
  }
  const response = rawResponse as { success: true; results: unknown[]; message?: string };

  assertEquals(response.success, true);
  assertEquals(response.results, []);
  assertEquals(response.message, undefined);
});

Deno.test("createSearchWorldTool returns found count message", async () => {
  const toolInstance = createSearchWorldTool(createFakeClient({
    searchResponse: {
      results: [{
        id: "search-result-id",
        subject: "http://example.org/Sunblade",
        predicate: "http://example.org/material",
        graph: "",
        text: "sunstone",
        score: 1,
      }],
    },
  }));
  const rawResponse: unknown = await toolInstance.execute!({ query: "sunstone" }, { toolCallId: "search-2", messages: [] });
  assertNonStreamResponse(rawResponse);
  if (rawResponse.success !== true || !Array.isArray(rawResponse.results)) {
    throw new Error("Expected successful search response");
  }
  const response = rawResponse as { success: true; results: unknown[]; message?: string };

  assertEquals(response.success, true);
  assertEquals(response.results, [{
    id: "search-result-id",
    subject: "http://example.org/Sunblade",
    predicate: "http://example.org/material",
    graph: "",
    text: "sunstone",
    score: 1,
  }]);
  assertEquals(response.message, undefined);
});

Deno.test("createSearchWorldTool returns safe failure on client error", async () => {
  const toolInstance = createSearchWorldTool(createFakeClient({ searchError: new Error("search failed") }));
  const rawResponse: unknown = await toolInstance.execute!({ query: "sunstone" }, { toolCallId: "search-3", messages: [] });
  assertNonStreamResponse(rawResponse);
  if (rawResponse.success !== false || typeof rawResponse.error !== "string") {
    throw new Error("Expected failed search response");
  }
  const response = rawResponse as { success: false; error: string };

  assertEquals(response.success, false);
  assertEquals(response.error, "search failed");
});
