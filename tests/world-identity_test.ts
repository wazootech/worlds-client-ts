import { client } from "../src/generated/client.gen.ts";
import { createWorld, getWorld } from "../src/generated/sdk.gen.ts";
import type {
  CreateWorldRequest,
  WorldResource,
} from "../src/generated/types.gen.ts";

type Assert<T extends true> = T;
type HasNone<T, K extends PropertyKey> = Extract<keyof T, K> extends never
  ? true
  : false;

type WorldHasCanonicalId = Assert<
  "id" extends keyof WorldResource ? true : false
>;
type WorldIdIsString = Assert<
  WorldResource["id"] extends string ? true : false
>;
type WorldHasNoLegacyIdentity = Assert<
  HasNone<WorldResource, "name" | "uid" | "worldId" | "slug">
>;
type CreateAcceptsNoIdentity = Assert<
  HasNone<CreateWorldRequest, "id" | "uid" | "worldId" | "slug">
>;

const worldId = "w_123e4567-e89b-42d3-a456-426614174000";

Deno.test("generated World types expose the server-minted canonical ID", () => {
  const checks: [
    WorldHasCanonicalId,
    WorldIdIsString,
    WorldHasNoLegacyIdentity,
    CreateAcceptsNoIdentity,
  ] = [true, true, true, true];
  assert(
    checks.every(Boolean),
    "Generated types must match the world-ID contract",
  );
});

Deno.test("OpenAPI world schema and operations use the settled identity contract", async () => {
  const spec = JSON.parse(
    await Deno.readTextFile(
      new URL("../openapi/openapi.json", import.meta.url),
    ),
  );
  const world = spec.components.schemas.WorldResource;
  const create = spec.components.schemas.CreateWorldRequest;
  const worldPaths = Object.entries(
    spec.paths as Record<string, Record<string, unknown>>,
  ).filter(([path]) => path.startsWith("/worlds/{"));

  assert("id" in world.properties, "WorldResource must expose id");
  assert(
    !["name", "uid", "worldId", "slug"].some((key) => key in world.properties),
    "WorldResource must not expose legacy identity aliases",
  );
  assert(
    !["id", "uid", "worldId", "slug"].some((key) => key in create.properties),
    "CreateWorldRequest must leave identity generation to the server",
  );
  assert(worldPaths.length > 0, "World-specific routes must be present");

  for (const [path, pathItem] of worldPaths) {
    assert(path.includes("{worldId}"), `${path} must use worldId`);
    for (const method of ["get", "post", "patch", "delete"]) {
      const operation = pathItem[method] as {
        parameters?: Array<{ in: string; name: string }>;
      } | undefined;
      if (!operation) continue;
      assert(
        operation.parameters?.some((parameter) =>
          parameter.in === "path" && parameter.name === "worldId"
        ),
        `${method.toUpperCase()} ${path} must declare worldId`,
      );
    }
  }
});

Deno.test("createWorld returns the minted ID and getWorld interpolates worldId", async () => {
  const requests: Request[] = [];
  client.setConfig({
    baseUrl: "https://data.example.test",
    fetch: (input, init) => {
      const request = input instanceof Request
        ? input
        : new Request(input, init);
      requests.push(request.clone());
      return Promise.resolve(
        new Response(JSON.stringify({ id: worldId }), {
          status: request.method === "POST" ? 201 : 200,
          headers: { "content-type": "application/json" },
        }),
      );
    },
  });

  const created = await createWorld({ body: { displayName: "Research" } });
  const mintedId = created.data?.id;
  assert(mintedId === worldId, "Create must return the server-minted ID");
  await getWorld({ path: { worldId: mintedId } });

  const createRequest = requests[0];
  const body = await createRequest.clone().json();
  assert(
    createRequest.url === "https://data.example.test/worlds",
    "Unexpected create URL",
  );
  assert(body.displayName === "Research", "Create must send the display name");
  assert(
    !("id" in body) && !("slug" in body),
    "Create must not choose an ID or slug",
  );
  assert(
    requests[1].url === `https://data.example.test/worlds/${worldId}`,
    "getWorld must address the worldId path",
  );
});

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
