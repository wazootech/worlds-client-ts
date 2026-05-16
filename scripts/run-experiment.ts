import { parseArgs } from "@std/cli/parse-args";
import { runExperiment } from "../evals/runner.ts";
import {
  formatClassBreakdownSummary,
  formatModelResultSummary,
} from "../evals/reporting/format-result-summary.ts";
import type { ExperimentConfig, RunExperimentOptions } from "../evals/types.ts";
import { discoverModules } from "./utils/discovery.ts";

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
  "  --model <id>  Limit execution to one or more model identifiers",
  "  --condition <name>  Limit execution to one or more condition names",
  "  --question-limit <n>  Override smokeQuestionLimit for this run",
].join("\n");

async function discoverExperiments(): Promise<string[]> {
  const experimentsUrl = new URL("../experiments/", import.meta.url);
  return await discoverModules(experimentsUrl);
}

if (import.meta.main) {
  const parsed = parseArgs(Deno.args, {
    boolean: ["all", "debug", "dry", "help"],
    string: ["model", "condition", "question-limit"],
    collect: ["model", "condition"],
    alias: { help: ["h"] },
    default: { all: false, debug: false, dry: false, help: false },
  });

  const questionLimitOverride = parsed["question-limit"] !== undefined
    ? Number(parsed["question-limit"])
    : undefined;

  if (
    questionLimitOverride !== undefined &&
    (!Number.isInteger(questionLimitOverride) || questionLimitOverride <= 0)
  ) {
    console.error("--question-limit must be a positive integer.");
    Deno.exit(1);
  }

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
    const runOptions: RunExperimentOptions = {
      debug: parsed.debug,
      dry: parsed.dry,
      modelFilter: parsed.model?.map(String),
      conditionFilter: parsed.condition?.map(String),
      questionLimitOverride,
    };

    console.log(`\nExperiment: ${config.name}`);

    if (parsed.dry) {
      const activeModelIds = runOptions.modelFilter?.length
        ? config.models.filter((modelEntry) =>
          runOptions.modelFilter?.includes(modelEntry.id)
        ).map((modelEntry) => modelEntry.id)
        : config.models.map((modelEntry) => modelEntry.id);
      const activeConditionNames = runOptions.conditionFilter?.length
        ? config.conditions.filter((condition) =>
          runOptions.conditionFilter?.includes(condition.name)
        ).map((condition) => condition.name)
        : config.conditions.map((condition) => condition.name);
      console.log(
        `  Evals: ${
          config.evals.length === 1 && config.evals[0] === "*"
            ? "all"
            : config.evals.join(", ")
        }`,
      );
      console.log(
        `  Models: ${activeModelIds.join(", ")}`,
      );
      console.log(
        `  Conditions: ${activeConditionNames.join(", ")}`,
      );
      console.log(`  Runs per question: ${config.runs}`);
      console.log(
        `  Question limit: ${
          questionLimitOverride ?? config.smokeQuestionLimit ?? "all"
        }`,
      );
      console.log(`  Base URL: ${config.baseUrl ?? "N/A"}`);
      continue;
    }

    const summary = await runExperiment(config, runOptions);

    console.log(`\nExperiment complete in ${summary.durationMs}ms`);
    console.log(
      `Results saved to results/${config.name}/${summary.timestamp}/`,
    );

    for (const result of summary.models) {
      console.log(formatModelResultSummary(result));

      for (const classSummary of result.classBreakdown ?? []) {
        console.log(formatClassBreakdownSummary(classSummary));
      }
    }
  }
}
