import type { EvalFixture } from "./types.ts";

export async function loadEval(name: string): Promise<EvalFixture> {
  const modulePath = new URL(`./${name}/EVAL.ts`, import.meta.url);
  const module = await import(modulePath.href);
  return module.default as EvalFixture;
}

export async function discoverEvals(): Promise<string[]> {
  const evalNames: string[] = [];
  for await (const entry of Deno.readDir(new URL(".", import.meta.url))) {
    if (entry.isDirectory) {
      try {
        const evalUrl = new URL(`./${entry.name}/EVAL.ts`, import.meta.url);
        await Deno.stat(evalUrl);
        evalNames.push(entry.name);
      } catch {
        // No EVAL.ts in this directory
      }
    }
  }
  return evalNames.sort();
}
