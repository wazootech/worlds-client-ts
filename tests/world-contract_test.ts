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

type WorldUsesCanonicalId = Assert<
  "id" extends keyof WorldResource ? true : false
>;
type WorldIdIsString = Assert<
  WorldResource["id"] extends string ? true : false
>;
type WorldHasNoLegacyIdentity = Assert<
  HasNone<WorldResource, "name" | "uid" | "slug">
>;
type CreateDoesNotAcceptIdentity = Assert<
  HasNone<CreateWorldRequest, "id" | "uid" | "worldId" | "slug">
>;

const worldId = "w_123e4567-e89b-42d3-a456-426614174000";

Deno.test("generated World types use server-minted id", () => {
  const checks: [
    WorldUsesCanonicalId,
    WorldIdIsString,
    WorldHasNoLegacyIdentity,
    CreateDoesNotAcceptIdentity,
  ] = [true, true, true, true];
  assert(checks.every(Boolean), "World types must follow the world-ID contract");
});

Deno.test("World schema and all world paths use the settled contract", async () => {
  const spec = JSON.parse(
    await Deno.readTextFile(
      new URL("../openapi/openapi.json", import.meta.url),
    ),
  );
  const world = spec.components.schemas.WorldResource;
  const create = spec.components.schemas.CreateWorldRequest;
  const worldPaths = Object.keys(spec.paths).filter((path) =>
    path.startsWith("/worlds/{")
  );

  assert("id" in world.properties, "WorldResource must expose id");
  assert(
    !["name", "uid", "slug"].some((key) => key in world.properties),
    "WorldResource must not expose legacy identity fields",
  );
  assert(
    !["id", "uid", "worldId", "slug"].some((key) =>
      key in create.properties
    ),
    "CreateWorldRequest must not accept a caller-selected identity",
  );
  assert(worldPaths.length > 0, "The spec must define worldId routes");
  assert(
    worldPaths.every((path) => path.includes("{worldId}")),
    "Every world-scoped route must name its parameter worldId",
  );
  for (const path of worldPaths) {
    const item = spec.paths[path];
    for (const [method, operation] of Object.entries(item)) {
      if (method === "parameters") continue;
      const pathParameters = (operation as { parameters?: Array<{ in: string; name: string }> }).parameters
        ?.filter((parameter) => parameter.in === "path") ?? [];
      assert(
        pathParameters.every((parameter) => parameter.name === "worldId"),
        `${method.toUpperCase()} ${path} must use worldId`,
      );
    }
  }
});

Deno.test("createWorld returns the minted id and getWorld interpolates worldId", async () => {
  const requests: Request[] = [];
  const client = createClient({
    baseUrl: "https://data.example.test",
    fetch: async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      requests.push(request);
      return new Response(
        JSON.stringify({ id: worldId }),
        { headers: { "content-type": "application/json" } },
      );
    },
  });

  const created = await createWorld({
    client,
    body: { displayName: "Research" },
  });
  await getWorld({ client, path: { worldId } });
  const sentBody = JSON.parse(await requests[0].clone().text());

  assert(
    requests[0].url === "https://data.example.test/worlds",
    "Create path changed",
  );
  assert(
    sentBody.displayName === "Research",
    "Create should send the display name",
  );
  assert(
    !("id" in sentBody) && !("slug" in sentBody),
    "Identity must be server-minted",
  );
  assert(created.data?.id === worldId, "Create should return the minted id");
  assert(
    requests[1].url === `https://data.example.test/worlds/${worldId}`,
    "Get should interpolate the worldId path parameter",
  );
});

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
