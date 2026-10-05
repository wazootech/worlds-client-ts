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
  HasNone<WorldResource, "name" | "uid" | "slug">
>;
type CreateAcceptsNoIdentity = Assert<
  HasNone<CreateWorldRequest, "id" | "uid" | "worldId" | "slug">
>;

const worldId = "w_123e4567-e89b-42d3-a456-426614174000";

Deno.test("generated World types expose only the canonical ID", () => {
  const checks: [
    WorldHasCanonicalId,
    WorldIdIsString,
    WorldHasNoLegacyIdentity,
    CreateAcceptsNoIdentity,
  ] = [true, true, true, true];
  assert(
    checks.every(Boolean),
    "Generated types must encode server-minted world identity",
  );
});

Deno.test("OpenAPI world schemas and operations use the settled contract", async () => {
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
    !["name", "uid", "worldId", "slug"].some((key) => key in world.properties),
    "WorldResource must not expose legacy identity aliases",
  );
  assert(
    !["id", "uid", "worldId", "slug"].some((key) => key in create.properties),
    "CreateWorldRequest must not accept an ID or slug",
  );
  assert(worldPaths.length > 0, "World-specific operations must exist");

  for (const path of worldPaths) {
    assert(path.includes("{worldId}"), `${path} must use worldId`);
    const item = spec.paths[path];
    for (const method of ["get", "post", "put", "patch", "delete"]) {
      const operation = item[method];
      if (!operation) continue;
      const parameter = operation.parameters.find((value) => value.in === "path");
      assert(parameter?.name === "worldId", `${method.toUpperCase()} ${path} must use worldId`);
    }
  }
});

Deno.test("createWorld sends display-name input and getWorld uses the minted ID", async () => {
  const requests: Request[] = [];
  const client = createClient({
    baseUrl: "https://data.example.test",
    fetch: async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      requests.push(request.clone());
      return new Response(JSON.stringify({ id: worldId }), {
        headers: { "content-type": "application/json" },
      });
    },
  });

  const created = await createWorld({
    client,
    body: { displayName: "Research" },
  });
  await getWorld({ client, path: { worldId: created.data!.id } });

  const body = JSON.parse(await requests[0].text());
  assert(requests[0].url === "https://data.example.test/worlds", "Unexpected create URL");
  assert(body.displayName === "Research", "Create must send the display name");
  assert(!("id" in body) && !("slug" in body), "The server must mint the world ID");
  assert(created.data?.id === worldId, "Create must return the server-minted ID");
  assert(
    requests[1].url === `https://data.example.test/worlds/${worldId}`,
    "getWorld must address the worldId path",
  );
});

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
