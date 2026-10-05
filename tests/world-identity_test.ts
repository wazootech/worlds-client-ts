import { createClient } from "../src/generated/client/index.ts";
import { createWorld, getWorld } from "../src/generated/sdk.gen.ts";
import type {
  CreateWorldRequest,
  WorldResource,
} from "../src/generated/types.gen.ts";

type Assert<T extends true> = T;
type HasNone<T, K extends PropertyKey> = Extract<keyof T, K> extends never
  ? true
  : false;

type WorldHasCanonicalId = Assert<"id" extends keyof WorldResource ? true : false>;
type WorldIdIsString = Assert<WorldResource["id"] extends string ? true : false>;
type WorldHasNoLegacyIdentity = Assert<
  HasNone<WorldResource, "name" | "uid" | "worldId">
>;
type CreateDoesNotAcceptIdentity = Assert<
  HasNone<CreateWorldRequest, "id" | "uid" | "worldId" | "slug">
>;

const worldId = "w_123e4567-e89b-42d3-a456-426614174000";

Deno.test("generated world types use a server-minted canonical ID", () => {
  const checks: [
    WorldHasCanonicalId,
    WorldIdIsString,
    WorldHasNoLegacyIdentity,
    CreateDoesNotAcceptIdentity,
  ] = [true, true, true, true];
  assert(checks.every(Boolean), "World types must match the world-ID contract");
});

Deno.test("OpenAPI world schema and path operations use worldId", async () => {
  const spec = JSON.parse(
    await Deno.readTextFile(new URL("../openapi/openapi.json", import.meta.url)),
  );
  const world = spec.components.schemas.WorldResource;
  const create = spec.components.schemas.CreateWorldRequest;
  const worldPaths = Object.entries(spec.paths).filter(([path]) =>
    path.startsWith("/worlds/{")
  );

  assert("id" in world.properties, "WorldResource must expose id");
  assert(
    !["name", "uid", "worldId"].some((key) => key in world.properties),
    "WorldResource must not expose legacy identity aliases",
  );
  assert(
    !["id", "uid", "worldId", "slug"].some((key) =>
      key in create.properties
    ),
    "CreateWorldRequest must leave identity generation to the server",
  );
  assert(worldPaths.length > 0, "World-specific routes must be present");

  for (const [path, pathItem] of worldPaths) {
    assert(path.includes("{worldId}"), `${path} must use worldId`);
    for (const [method, operation] of Object.entries(pathItem as Record<string, unknown>)) {
      if (["parameters", "servers", "summary", "description", "$ref"].includes(method)) {
        continue;
      }
      const parameters = (operation as { parameters?: Array<{ in: string; name: string }> }).parameters ?? [];
      assert(
        parameters.some((parameter) => parameter.in === "path" && parameter.name === "worldId"),
        `${method.toUpperCase()} ${path} must declare worldId`,
      );
    }
  }
});

Deno.test("world creation sends no caller-selected ID and world reads use worldId", async () => {
  const requests: Request[] = [];
  const client = createClient({
    baseUrl: "https://data.example.test",
    fetch: async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      requests.push(request);
      const payload = request.url.endsWith("/worlds")
        ? { id: worldId }
        : { id: worldId };
      return new Response(JSON.stringify(payload), {
        headers: { "content-type": "application/json" },
      });
    },
  });

  const created = await createWorld({
    client,
    body: { displayName: "Research" },
  });
  await getWorld({ client, path: { worldId } });

  const createRequest = requests[0];
  const body = await createRequest.clone().json();
  assert(createRequest.url === "https://data.example.test/worlds", "Unexpected create path");
  assert(body.displayName === "Research", "Create request must include the display name");
  assert(!("id" in body) && !("slug" in body), "Create request must not choose an ID or slug");
  assert(created.data?.id === worldId, "Create response must expose the minted ID");
  assert(
    requests[1].url === `https://data.example.test/worlds/${worldId}`,
    "World read must interpolate the worldId path parameter",
  );
});

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
