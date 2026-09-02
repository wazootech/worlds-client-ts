// Syncs openapi/openapi.json from the Worlds API OpenAPI document. The
// canonical source is the committed snapshot in the worlds-api repo
// (openapi/openapi.json), which the Worlds API CI keeps drift-free. Sources,
// in order: WORLDS_API_OPENAPI_SOURCE, WORLDS_API_OPENAPI_URL (deployed
// document, e.g. https://data.wazoo.dev/openapi.json), the sibling worlds-api
// checkout, then the raw GitHub snapshot of worlds-api main. Pass --check to
// fail when the committed snapshot is stale (used by CI instead of rewriting
// it).
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(repoRoot, "openapi/openapi.json");
const checkOnly = Deno.args.includes("--check");

const siblingSnapshot = resolve(repoRoot, "../worlds-api/openapi/openapi.json");
const source = Deno.env.get("WORLDS_API_OPENAPI_SOURCE") ??
  Deno.env.get("WORLDS_API_OPENAPI_URL") ??
  (existsSync(siblingSnapshot)
    ? "../worlds-api/openapi/openapi.json"
    : "https://raw.githubusercontent.com/wazootech/worlds-api/main/openapi/openapi.json");

const spec = await loadSpec(source);
const next = `${JSON.stringify(spec, null, 2)}\n`;

await mkdir(dirname(outputPath), { recursive: true });

let previous: string | null = null;
try {
  previous = await readFile(outputPath, "utf8");
} catch {
  // first sync
}

if (previous === next) {
  console.log("openapi/openapi.json unchanged");
} else if (checkOnly) {
  console.error(
    "openapi/openapi.json is stale. Run `deno task sync:openapi` and commit the result.",
  );
  Deno.exit(1);
} else {
  await writeFile(outputPath, next);
  console.log("openapi/openapi.json updated");
}

async function loadSpec(value: string): Promise<unknown> {
  if (/^https?:\/\//.test(value)) {
    const response = await fetch(value);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${value}: ${response.status}`);
    }
    return response.json();
  }

  const path = resolve(repoRoot, value);
  if (path.endsWith(".json")) {
    return JSON.parse(await readFile(path, "utf8"));
  }
  const mod = await import(pathToFileURL(path).href);
  return mod.default;
}
