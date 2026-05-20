import { ensureDir } from "@std/fs";
import { dirname, fromFileUrl, join } from "@std/path";
import { runEvalCase } from "./agent-runner.ts";
import { applyAssertions } from "./assertions.ts";
import { evalCases } from "./test-cases.ts";
import type { EvalCaseDefinition, EvalSuiteResult } from "./types.ts";

const providerId = "google";
const modelId = Deno.env.get("EVAL_MODEL_ID") ?? "gemini-3.1-flash-lite";

interface EvalCliOptions {
  filter?: RegExp;
  list: boolean;
  permitNoFiles: boolean;
}

/** escapeRegExp escapes a literal string for safe regex matching. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** parseFilter compiles a Deno-test-like string-or-regexp filter. */
function parseFilter(rawFilter: string): RegExp {
  if (rawFilter.startsWith("/") && rawFilter.lastIndexOf("/") > 0) {
    const trailingSlashIndex = rawFilter.lastIndexOf("/");
    const pattern = rawFilter.slice(1, trailingSlashIndex);
    const flags = rawFilter.slice(trailingSlashIndex + 1);
    return new RegExp(pattern, flags);
  }

  return new RegExp(escapeRegExp(rawFilter), "i");
}

/** parseCliOptions reads supported targeting flags from Deno.args. */
function parseCliOptions(args: string[]): EvalCliOptions {
  let filter: RegExp | undefined;
  let list = false;
  let permitNoFiles = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (argument === "--list") {
      list = true;
      continue;
    }

    if (argument === "--permit-no-files") {
      permitNoFiles = true;
      continue;
    }

    if (argument === "--filter") {
      const rawFilter = args[index + 1];
      if (!rawFilter) {
        throw new Error("Missing value for --filter");
      }
      filter = parseFilter(rawFilter);
      index += 1;
      continue;
    }

    throw new Error(
      `Unsupported argument: ${argument}. Supported flags: --filter <pattern>, --list, --permit-no-files`,
    );
  }

  return { filter, list, permitNoFiles };
}

/** selectEvalCases filters eval cases by id and description. */
function selectEvalCases(
  cases: EvalCaseDefinition[],
  options: EvalCliOptions,
): EvalCaseDefinition[] {
  if (!options.filter) {
    return cases;
  }

  return cases.filter((testCase) =>
    options.filter?.test(testCase.id) ||
    options.filter?.test(testCase.description)
  );
}

/** printAvailableCases lists the available eval case IDs and names. */
function printAvailableCases(cases: EvalCaseDefinition[]): void {
  console.log("Available eval cases:");
  for (const testCase of cases) {
    console.log(`- ${testCase.id}: ${testCase.description}`);
  }
}

/** writeResults persists the latest eval suite report to disk. */
async function writeResults(result: EvalSuiteResult): Promise<string> {
  const evalsDirectory = dirname(fromFileUrl(import.meta.url));
  const resultsDirectory = join(evalsDirectory, "results");
  const outputPath = join(resultsDirectory, "latest.json");
  await ensureDir(resultsDirectory);
  await Deno.writeTextFile(outputPath, JSON.stringify(result, null, 2));
  return outputPath;
}

/** printSummary renders a concise terminal summary for local debugging. */
function printSummary(result: EvalSuiteResult): void {
  console.log(`Provider: ${result.providerId}`);
  console.log(`Model: ${result.modelId}`);
  console.log(`Suite success: ${result.success}`);
  console.log("");

  for (const testResult of result.results) {
    const tools = testResult.metadata.trajectory.map((record) =>
      record.toolName
    ).join(
      ", ",
    );
    console.log(
      `[${testResult.success ? "PASS" : "FAIL"}] ${testResult.description}`,
    );
    console.log(`  Steps: ${testResult.metadata.stepCount}`);
    console.log(`  Tools: ${tools || "(none)"}`);
    if (testResult.error) {
      console.log(`  Error: ${testResult.error}`);
    }
    for (const assertion of testResult.assertions) {
      console.log(`  - ${assertion.pass ? "PASS" : "FAIL"}: ${assertion.name}`);
    }
    console.log("");
  }
}

if (import.meta.main) {
  const cliOptions = parseCliOptions(Deno.args);
  const selectedEvalCases = selectEvalCases(evalCases, cliOptions);

  if (cliOptions.list) {
    printAvailableCases(selectedEvalCases);
    Deno.exit();
  }

  if (selectedEvalCases.length === 0) {
    const message = "No eval cases matched the provided filter.";
    if (cliOptions.permitNoFiles) {
      console.log(message);
      Deno.exit();
    }

    throw new Error(message);
  }

  const results = [];
  for (const testCase of selectedEvalCases) {
    const rawResult = await runEvalCase(testCase, { providerId, modelId });
    results.push(applyAssertions(rawResult));
  }

  const suiteResult: EvalSuiteResult = {
    providerId,
    modelId,
    timestamp: new Date().toISOString(),
    success: results.every((result) => result.success),
    results,
  };

  printSummary(suiteResult);
  const outputPath = await writeResults(suiteResult);
  console.log(`Wrote results to ${outputPath}`);

  if (!suiteResult.success) {
    Deno.exitCode = 1;
  }
}
