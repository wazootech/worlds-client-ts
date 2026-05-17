import type { EvalFixture } from "./types.ts";
import { discoverModules } from "../scripts/utils/discovery.ts";

export async function loadEval(name: string): Promise<EvalFixture> {
  const modulePath = new URL(`./${name}/EVAL.ts`, import.meta.url);
  const module = await import(modulePath.href);
  return module.default as EvalFixture;
}

export async function discoverEvals(): Promise<string[]> {
  const baseUrl = new URL(".", import.meta.url);
  return await discoverModules(baseUrl, {
    includeFiles: false,
    includeDirectories: true,
    requiredFile: "EVAL.ts",
  });
}
