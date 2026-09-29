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

type WorldUsesCanonicalId = Assert<
  "id" extends keyof WorldResource ? true : false
>;
type WorldIdIsString = Assert<
  WorldResource["id"] extends string ? true : false
>;
type WorldHasNoLegacyIdentity = Assert<
  HasNone<WorldResource, "name" | "uid" | "worldId" | "slug">
>;
type CreateDoesNotAcceptIdentity = Assert<
  HasNone<CreateWorldRequest, "id" | "uid" | "worldId" | "slug">
>;

const worldId = "w_123e4567-e89b-42d3-a456-426614174000";

Deno.test("generated types encode only the canonical world ID", () => {
  const checks: [
    WorldUsesCanonicalId,
    WorldIdIsString,
    WorldHasNoLegacyIdentity,
    CreateDoesNotAcceptIdentity,
  ] = [true, true, true, true];
  assert(
    checks.every(Boolean),
    "Generated world types must match the world-ID contract",
  );
});

Deno.test("World schema and all world paths use the settled identity", async () => {
  const spec = JSON.parse(
    await Deno.readTextFile(
      new URL("../openapi/openapi.json", import.meta.url),
    ),
  );
  const world = spec.components.schemas.WorldResource;
  const create = spec.components.schemas.CreateWorldRequest;
  const worldProperties = Object.keys(world.properties);
  const createProperties = Object.keys(create.properties);
  const worldPaths = Object.keys(spec.paths).filter((path) =>
    path.startsWith("/worlds/{")
  );
  type PathParameter = {
    name?: string;
    in?: string;
    schema?: { pattern?: string };
  };
  type OpenApiOperation = { parameters?: PathParameter[] };
  const pathItems = spec.paths as Record<
    string,
    Record<string, OpenApiOperation>
  >;
  const worldIdParameters = Object.entries(pathItems)
    .filter(([path]) => path.startsWith("/worlds/{"))
    .flatMap(([, pathItem]) =>
      Object.entries(pathItem)
        .filter(([method]) =>
          ["get", "post", "put", "patch", "delete", "head", "options", "trace"]
            .includes(method)
        )
        .flatMap(([, operation]) => operation.parameters ?? [])
    )
    .filter((parameter) => parameter.name === "worldId");
  const worldIdPattern =
    "^w_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$";

  assert(worldProperties.includes("id"), "WorldResource must expose id");
  assert(
    !worldProperties.some((key) =>
      ["name", "uid", "worldId", "slug"].includes(key)
    ),
    "WorldResource must not expose legacy identity aliases",
  );
  assert(
    !createProperties.some((key) =>
      ["id", "uid", "worldId", "slug"].includes(key)
    ),
    "CreateWorldRequest must not accept a caller-selected identity",
  );
  assert(worldPaths.length > 0, "The spec must define world-ID routes");
  assert(
    worldPaths.every((path) =>
      !path.includes("{id}") && path.includes("{worldId}")
    ),
    "Every world path must name its ID parameter worldId",
  );
  assert(
    worldIdParameters.length > 0,
    "The spec must define worldId parameters",
  );
  assert(
    worldIdParameters.every((parameter) =>
      parameter.in === "path" && parameter.schema?.pattern === worldIdPattern
    ),
    "Every worldId path parameter must validate the canonical UUIDv4 ID",
  );
});

Deno.test("createWorld sends display-name input and returns the minted id", async () => {
  let request: Request | undefined;
  client.setConfig({
    baseUrl: "https://data.example.test",
    fetch: (input) => {
      request = input instanceof Request ? input : new Request(input);
      return Promise.resolve(
        new Response(JSON.stringify({ id: worldId }), {
          headers: { "content-type": "application/json" },
        }),
      );
    },
  });

  const result = await createWorld({
    body: { displayName: "Research" },
  });
  const sentBody = JSON.parse(await request!.text());

  assert(
    request!.url === "https://data.example.test/worlds",
    "World creation path changed",
  );
  assert(
    sentBody.displayName === "Research",
    "World creation should send its display name",
  );
  assert(
    !("id" in sentBody) && !("slug" in sentBody),
    "World ID must be server-minted",
  );
  assert(
    result.data?.id === worldId,
    "World creation should return the minted id",
  );
});

Deno.test("getWorld interpolates the canonical worldId path parameter", async () => {
  let requestUrl = "";
  client.setConfig({
    baseUrl: "https://data.example.test",
    fetch: (request) => {
      requestUrl = request instanceof Request
        ? request.url
        : new URL(request).href;
      return Promise.resolve(
        new Response(JSON.stringify({ id: worldId }), {
          headers: { "content-type": "application/json" },
        }),
      );
    },
  });

  await getWorld({ path: { worldId } });

  assert(
    requestUrl === `https://data.example.test/worlds/${worldId}`,
    "World reads must address the worldId route",
  );
});

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
