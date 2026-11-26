// Smoke test for the published surface: the generated client builds requests
// against the configured base URL, sends the bearer token and parses JSON. It
// uses node:test and node:assert so it runs unchanged on Deno, Bun and Node;
// the network is replaced by an injected fetch.
//
// The tests configure the shared `client` with `setConfig` rather than passing
// a `client` option to each call: the generated request code spreads its
// options into `new Request(url, init)`, and Deno rejects the extra `client`
// key (it expects a Deno.HttpClient there).
import assert from "node:assert/strict";
import { test } from "node:test";
import { client, getHealth, searchWorld } from "../src/index.ts";

type Seen = { url: string; method: string; authorization: string | null };

function mockFetch(body: unknown, seen: Seen[]) {
  client.setConfig({
    baseUrl: "https://worlds.test",
    auth: "secret-token",
    fetch: (input: Request | string | URL, init?: RequestInit) => {
      const request =
        input instanceof Request ? input : new Request(input, init);
      seen.push({
        url: request.url,
        method: request.method,
        authorization: request.headers.get("authorization"),
      });
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    },
  });
}

test("getHealth requests /health and parses the JSON body", async () => {
  const seen: Seen[] = [];
  mockFetch({ status: "ok" }, seen);
  const response = await getHealth();
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, "https://worlds.test/health");
  assert.equal(seen[0].method, "GET");
  assert.deepEqual(response.data, { status: "ok" });
});

test("searchWorld posts to the world path with a bearer token", async () => {
  const seen: Seen[] = [];
  mockFetch({ results: [] }, seen);
  const response = await searchWorld({
    path: { worldId: "w_test" },
    body: { query: "explores" },
  });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].method, "POST");
  assert.ok(seen[0].url.startsWith("https://worlds.test/"));
  assert.ok(seen[0].url.includes("w_test"));
  assert.equal(seen[0].authorization, "Bearer secret-token");
  assert.deepEqual(response.data, { results: [] });
});
