import { assertEquals } from "@std/assert";
import { createExecuteSparqlTool } from "./sparql.ts";
import { createFakeClient } from "./test-client.ts";
import type { ToolResult } from "./utils.ts";

type SparqlToolResponse = ToolResult<{ data: unknown }>;

function assertNonStreamResponse(
  response: unknown,
): asserts response is SparqlToolResponse {
  if (
    typeof response !== "object" ||
    response === null ||
    Symbol.asyncIterator in response
  ) {
    throw new Error("Expected non-stream tool response");
  }
}

Deno.test("createExecuteSparqlTool executes valid ASK query", async () => {
  const toolInstance = createExecuteSparqlTool(createFakeClient({
    sparqlResponse: {
      kind: "ask",
      data: {
        head: {},
        boolean: true,
      },
    },
  }));
  const response = await toolInstance.execute!({
    query: "ASK WHERE { ?s ?p ?o }",
  }, { toolCallId: "sparql-1", messages: [] });
  assertNonStreamResponse(response);

  assertEquals(response.success, true);
  if (response.success === true) {
    assertEquals(response.data, {
      head: {},
      boolean: true,
    });
  }
});

Deno.test("createExecuteSparqlTool returns syntax failure", async () => {
  const toolInstance = createExecuteSparqlTool(createFakeClient({
    sparqlResponse: {
      kind: "ask",
      data: { head: {}, boolean: true },
    },
  }));
  const response = await toolInstance.execute!({ query: "ASK WHERE {" }, {
    toolCallId: "sparql-2",
    messages: [],
  });
  assertNonStreamResponse(response);

  assertEquals(response.success, false);
  if (response.success === false) {
    assertEquals(typeof response.error, "string");
    assertEquals(response.error?.startsWith("SPARQL syntax error:"), true);
  }
});

Deno.test("createExecuteSparqlTool blocks update statements when disabled", async () => {
  const toolInstance = createExecuteSparqlTool(
    createFakeClient({
      sparqlResponse: {
        kind: "void",
      },
    }),
    { allowUpdates: false },
  );
  const response = await toolInstance.execute!({
    query: "DELETE WHERE { ?s ?p ?o }",
  }, { toolCallId: "sparql-3", messages: [] });
  assertNonStreamResponse(response);

  assertEquals(response.success, false);
  if (response.success === false) {
    assertEquals(
      response.error,
      "SPARQL updates are disabled for this agent. Please only execute SELECT or ASK queries.",
    );
  }
});

Deno.test("createExecuteSparqlTool returns safe failure on client error", async () => {
  const toolInstance = createExecuteSparqlTool(
    createFakeClient({ sparqlError: new Error("query failed") }),
  );
  const response = await toolInstance.execute!({
    query: "ASK WHERE { ?s ?p ?o }",
  }, { toolCallId: "sparql-4", messages: [] });
  assertNonStreamResponse(response);

  assertEquals(response.success, false);
  if (response.success === false) {
    assertEquals(response.error, "query failed");
  }
});
