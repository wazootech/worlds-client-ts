import { parseArgs } from "@std/cli/parse-args";
import { runExperiment } from "../evals/runner.ts";
import type { ExperimentConfig } from "../evals/types.ts";

const USAGE = [
  "Usage: deno run -A scripts/run-experiment.ts [options] [experiment-names...]",
  "",
  "Runs experiments defined in experiments/<name>.ts.",
  "",
  "Options:",
  "  -h, --help    Show this help message",
  "  --all         Run all experiments in experiments/",
  "  --debug       Print per-question traces to stdout",
  "  --dry         Preview without making API calls",
].join("\n");

async function discoverExperiments(): Promise<string[]> {
  const names: string[] = [];
  const experimentsUrl = new URL("../experiments/", import.meta.url);
  for await (const entry of Deno.readDir(experimentsUrl)) {
    if (entry.isFile && entry.name.endsWith(".ts")) {
      names.push(entry.name.replace(/\.ts$/, ""));
    }
  }
  return names.sort();
}

if (import.meta.main) {
  const parsed = parseArgs(Deno.args, {
    boolean: ["all", "debug", "dry", "help"],
    alias: { help: ["h"] },
    default: { all: false, debug: false, dry: false, help: false },
  });

  if (parsed.help) {
    console.log(USAGE);
    Deno.exit(0);
  }

  const experimentNames = [...parsed._] as string[];

  if (parsed.all) {
    const discovered = await discoverExperiments();
    for (const name of discovered) {
      if (!experimentNames.includes(name)) {
        experimentNames.push(name);
      }
    }
  }

  if (experimentNames.length === 0) {
    console.error(
      "No experiment specified. Pass one or more experiment names or --all.",
    );
    console.error("Available experiments:");
    const available = await discoverExperiments();
    for (const name of available) {
      console.error(`  ${name}`);
    }
    Deno.exit(1);
  }

  for (const name of experimentNames) {
    const configUrl = new URL(`../experiments/${name}.ts`, import.meta.url);
    const configModule = await import(configUrl.href);
    const config = configModule.default as ExperimentConfig;

    console.log(`\nExperiment: ${config.name}`);

    if (parsed.dry) {
      console.log(
        `  Evals: ${
          config.evals.length === 1 && config.evals[0] === "*"
            ? "all"
            : config.evals.join(", ")
        }`,
      );
      console.log(
        `  Models: ${
          config.models.map((modelEntry) => modelEntry.id).join(", ")
        }`,
      );
      console.log(
        `  Conditions: ${
          config.conditions.map((condition) => condition.name).join(", ")
        }`,
      );
      console.log(`  Runs per question: ${config.runs}`);
      console.log(`  Base URL: ${config.baseUrl ?? "N/A"}`);
      continue;
    }

    const summary = await runExperiment(config, {
      debug: parsed.debug,
      dry: parsed.dry,
    });

    console.log(`\nExperiment complete in ${summary.durationMs}ms`);
    console.log(
      `Results saved to results/${config.name}/${summary.timestamp}/`,
    );

    for (const result of summary.models) {
      const extras: string[] = [];
      if (result.refusalMatches !== undefined) {
        extras.push(`refusal:${result.refusalMatches}`);
      }
      if (result.toolSelectionAccuracy !== undefined) {
        extras.push(`toolSel:${(result.toolSelectionAccuracy * 100).toFixed(1)}%`);
      }
      if (result.unnecessaryToolCalls !== undefined && result.unnecessaryToolCalls > 0) {
        extras.push(`unnecessaryTools:${result.unnecessaryToolCalls}`);
      }
      const extrasStr = extras.length > 0 ? ` (${extras.join(", ")})` : "";
      console.log(
        `  ${result.model} / ${result.condition}: ${
          (result.accuracy * 100).toFixed(1)
        }%  tools:${(result.toolUsageRate * 100).toFixed(1)}%${extrasStr}`,
      );
    }
  }
}
