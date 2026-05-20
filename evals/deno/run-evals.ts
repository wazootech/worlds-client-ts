import { ensureDir } from "@std/fs";
import { dirname, fromFileUrl, join } from "@std/path";
import { runEvalCase } from "./agent-runner.ts";
import { applyAssertions } from "./assertions.ts";
import { evalCases } from "./test-cases.ts";
import type {
  EvalCaseDefinition,
  EvalCaseResult,
  EvalSuiteResult,
  GoldenEvalCaseResult,
} from "./types.ts";

const providerId = "google";
const modelId = Deno.env.get("EVAL_MODEL_ID") ?? "gemini-3.1-flash-lite";

interface EvalCliOptions {
  filter?: RegExp;
  list: boolean;
  permitNoFiles: boolean;
  updateGoldens: boolean;
  checkGoldens: boolean;
}

interface GoldenComparisonIssue {
  field: string;
  message: string;
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
  let updateGoldens = false;
  let checkGoldens = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (argument === "--") {
      continue;
    }

    if (argument === "--list") {
      list = true;
      continue;
    }

    if (argument === "--permit-no-files") {
      permitNoFiles = true;
      continue;
    }

    if (argument === "--update-goldens") {
      updateGoldens = true;
      continue;
    }

    if (argument === "--check-goldens") {
      checkGoldens = true;
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
      `Unsupported argument: ${argument}. Supported flags: --filter <pattern>, --list, --permit-no-files, --update-goldens, --check-goldens`,
    );
  }

  if (updateGoldens && checkGoldens) {
    throw new Error(
      "Use either --update-goldens or --check-goldens, not both.",
    );
  }

  if ((updateGoldens || checkGoldens) && !filter) {
    throw new Error(
      "Golden operations require --filter so updates and checks stay intentionally scoped.",
    );
  }

  return { filter, list, permitNoFiles, updateGoldens, checkGoldens };
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

/** sanitizeFileNameSegment converts a provider or model id into a path-safe segment. */
function sanitizeFileNameSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9.-]+/g, "-").replace(/-+/g, "-");
}

/** sanitizeGoldenCaseResult drops volatile metadata before snapshot storage. */
function sanitizeGoldenCaseResult(
  result: EvalCaseResult,
): GoldenEvalCaseResult {
  return {
    id: result.id,
    description: result.description,
    prompt: result.prompt,
    output: result.output,
    success: result.success,
    metadata: {
      providerId: result.metadata.providerId,
      modelId: result.metadata.modelId,
      stepCount: result.metadata.stepCount,
      finishReason: result.metadata.finishReason,
      trajectory: result.metadata.trajectory,
    },
    assertions: result.assertions,
    error: result.error,
  };
}

/** getGoldensDirectory resolves the committed golden snapshot directory. */
function getGoldensDirectory(): string {
  const evalsDirectory = dirname(fromFileUrl(import.meta.url));
  return join(evalsDirectory, "goldens");
}

/** getGoldenSnapshotPath resolves the per-case golden path for a provider/model pair. */
function getGoldenSnapshotPath(
  testCase: EvalCaseDefinition,
  provider: string,
  model: string,
): string {
  const goldensDirectory = getGoldensDirectory();
  return join(
    goldensDirectory,
    `${testCase.id}.${sanitizeFileNameSegment(provider)}.${
      sanitizeFileNameSegment(model)
    }.json`,
  );
}

/** normalizeOutputText canonicalizes free-form final text before tolerant comparison. */
function normalizeOutputText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

/** compareGoldenOutput applies the case-specific final output comparison policy. */
function compareGoldenOutput(
  testCase: EvalCaseDefinition,
  expected: GoldenEvalCaseResult,
  actual: GoldenEvalCaseResult,
): GoldenComparisonIssue[] {
  switch (testCase.golden.output.mode) {
    case "ignore":
      return [];
    case "normalized-exact": {
      if (expected.output === actual.output) {
        return [];
      }
      return [{
        field: "output",
        message: "Final output does not match the committed golden.",
      }];
    }
    case "contains-substrings": {
      const normalizedActualOutput = normalizeOutputText(actual.output);
      const missingSubstrings = testCase.golden.output.requiredSubstrings
        .filter((substring) =>
          !normalizedActualOutput.includes(normalizeOutputText(substring))
        );
      if (missingSubstrings.length === 0) {
        return [];
      }
      return [{
        field: "output",
        message: `Final output is missing required substrings: ${
          missingSubstrings.join(", ")
        }`,
      }];
    }
  }
}

/** compareGoldenCaseResult checks sanitized structured fields exactly and output fields by policy. */
function compareGoldenCaseResult(
  testCase: EvalCaseDefinition,
  expected: GoldenEvalCaseResult,
  actual: GoldenEvalCaseResult,
): GoldenComparisonIssue[] {
  const issues: GoldenComparisonIssue[] = [];
  const exactFieldComparisons: Array<[string, unknown, unknown]> = [
    ["id", expected.id, actual.id],
    ["description", expected.description, actual.description],
    ["prompt", expected.prompt, actual.prompt],
    ["success", expected.success, actual.success],
    [
      "metadata.providerId",
      expected.metadata.providerId,
      actual.metadata.providerId,
    ],
    ["metadata.modelId", expected.metadata.modelId, actual.metadata.modelId],
    [
      "metadata.stepCount",
      expected.metadata.stepCount,
      actual.metadata.stepCount,
    ],
    [
      "metadata.finishReason",
      expected.metadata.finishReason,
      actual.metadata.finishReason,
    ],
    [
      "metadata.trajectory",
      expected.metadata.trajectory,
      actual.metadata.trajectory,
    ],
    ["assertions", expected.assertions, actual.assertions],
    ["error", expected.error, actual.error],
  ];

  for (const [field, expectedValue, actualValue] of exactFieldComparisons) {
    if (JSON.stringify(expectedValue) !== JSON.stringify(actualValue)) {
      issues.push({
        field,
        message: `Golden mismatch for ${field}.`,
      });
    }
  }

  issues.push(...compareGoldenOutput(testCase, expected, actual));
  return issues;
}

/** writeGoldenSnapshots persists per-case golden snapshots for the selected suite results. */
async function writeGoldenSnapshots(
  suiteResult: EvalSuiteResult,
  selectedCases: EvalCaseDefinition[],
): Promise<string[]> {
  const goldensDirectory = getGoldensDirectory();
  await ensureDir(goldensDirectory);
  const writtenPaths: string[] = [];

  for (const testCase of selectedCases) {
    const caseResult = suiteResult.results.find((result) =>
      result.id === testCase.id
    );
    if (!caseResult) {
      throw new Error(`Missing suite result for case id: ${testCase.id}`);
    }
    const outputPath = getGoldenSnapshotPath(
      testCase,
      suiteResult.providerId,
      suiteResult.modelId,
    );
    const goldenResult = sanitizeGoldenCaseResult(caseResult);
    await Deno.writeTextFile(outputPath, JSON.stringify(goldenResult, null, 2));
    writtenPaths.push(outputPath);
  }

  return writtenPaths;
}

/** checkGoldenSnapshots compares selected cases against committed per-case goldens. */
async function checkGoldenSnapshots(
  suiteResult: EvalSuiteResult,
  selectedCases: EvalCaseDefinition[],
): Promise<GoldenComparisonIssue[]> {
  const goldensDirectory = getGoldensDirectory();
  await ensureDir(goldensDirectory);
  const issues: GoldenComparisonIssue[] = [];

  for (const testCase of selectedCases) {
    const goldenPath = getGoldenSnapshotPath(
      testCase,
      suiteResult.providerId,
      suiteResult.modelId,
    );
    let goldenText: string;
    try {
      goldenText = await Deno.readTextFile(goldenPath);
    } catch (error) {
      issues.push({
        field: `${testCase.id}.golden`,
        message: error instanceof Error
          ? `Missing or unreadable golden snapshot at ${goldenPath}: ${error.message}`
          : `Missing or unreadable golden snapshot at ${goldenPath}`,
      });
      continue;
    }

    const expected = JSON.parse(goldenText) as GoldenEvalCaseResult;
    const actualSource = suiteResult.results.find((result) =>
      result.id === testCase.id
    );
    if (!actualSource) {
      issues.push({
        field: `${testCase.id}.result`,
        message: `Missing suite result for case id: ${testCase.id}`,
      });
      continue;
    }
    const actual = sanitizeGoldenCaseResult(actualSource);
    for (const issue of compareGoldenCaseResult(testCase, expected, actual)) {
      issues.push({
        field: `${testCase.id}.${issue.field}`,
        message: issue.message,
      });
    }
  }

  return issues;
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

/** printGoldenComparisonIssues renders concise golden check failures. */
function printGoldenComparisonIssues(issues: GoldenComparisonIssue[]): void {
  if (issues.length === 0) {
    console.log("Golden snapshot check passed.");
    return;
  }

  console.log("Golden snapshot check failed:");
  for (const issue of issues) {
    console.log(`- ${issue.field}: ${issue.message}`);
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

  if (cliOptions.updateGoldens) {
    const writtenPaths = await writeGoldenSnapshots(
      suiteResult,
      selectedEvalCases,
    );
    for (const writtenPath of writtenPaths) {
      console.log(`Updated golden snapshot ${writtenPath}`);
    }
  }

  if (cliOptions.checkGoldens) {
    const issues = await checkGoldenSnapshots(suiteResult, selectedEvalCases);
    printGoldenComparisonIssues(issues);
    if (issues.length > 0) {
      Deno.exitCode = 1;
    }
  }

  if (!suiteResult.success) {
    Deno.exitCode = 1;
  }
}
