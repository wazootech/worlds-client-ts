import { ensureDir } from "@std/fs";
import { dirname, fromFileUrl, join } from "@std/path";
import { runEvalCase } from "./agent-runner.ts";
import { applyAssertions } from "./assertions.ts";
import { evalCases } from "./test-cases.ts";
import type {
  EvalAssertionPassRate,
  EvalCaseDefinition,
  EvalCasePassRate,
  EvalCaseResult,
  EvalStatsResult,
  EvalSuiteResult,
  GoldenEvalCaseResult,
} from "./types.ts";

const providerId = Deno.env.get("EVAL_PROVIDER_ID") ?? "google";
const modelId = Deno.env.get("EVAL_MODEL_ID") ?? "gemini-3.1-flash-lite";
const supportedProviderIds = new Set(["google"]);

interface EvalCliOptions {
  filter?: RegExp;
  list: boolean;
  permitNoFiles: boolean;
  updateGoldens: boolean;
  checkGoldens: boolean;
  trialCount: number;
  minPassRate?: number;
}

interface GoldenComparisonIssue {
  field: string;
  message: string;
}

/** validateProviderId prevents mislabeled provider metadata and golden paths. */
function validateProviderId(provider: string): void {
  if (!supportedProviderIds.has(provider)) {
    throw new Error(
      `Unsupported EVAL_PROVIDER_ID: ${provider}. Supported providers: google`,
    );
  }
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

/** parsePositiveIntegerOption validates a CLI numeric flag value. */
function parsePositiveIntegerOption(
  flagName: string,
  rawValue: string | undefined,
): number {
  if (!rawValue) {
    throw new Error(`Missing value for ${flagName}`);
  }

  const parsedValue = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsedValue) || parsedValue < 1) {
    throw new Error(`${flagName} must be a positive integer; got: ${rawValue}`);
  }

  return parsedValue;
}

/** parsePassRateOption validates an optional minimum pass-rate threshold. */
function parsePassRateOption(
  flagName: string,
  rawValue: string | undefined,
): number {
  if (!rawValue) {
    throw new Error(`Missing value for ${flagName}`);
  }

  const parsedValue = Number.parseFloat(rawValue);
  if (!Number.isFinite(parsedValue) || parsedValue < 0 || parsedValue > 1) {
    throw new Error(`${flagName} must be between 0 and 1; got: ${rawValue}`);
  }

  return parsedValue;
}

/** parseCliOptions reads supported targeting flags from Deno.args. */
function parseCliOptions(args: string[]): EvalCliOptions {
  let filter: RegExp | undefined;
  let list = false;
  let permitNoFiles = false;
  let updateGoldens = false;
  let checkGoldens = false;
  let trialCount = Number.parseInt(Deno.env.get("EVAL_TRIALS") ?? "1", 10);
  let minPassRate: number | undefined;

  if (!Number.isFinite(trialCount) || trialCount < 1) {
    trialCount = 1;
  }

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

    if (argument === "--trials") {
      trialCount = parsePositiveIntegerOption("--trials", args[index + 1]);
      index += 1;
      continue;
    }

    if (argument === "--min-pass-rate") {
      minPassRate = parsePassRateOption("--min-pass-rate", args[index + 1]);
      index += 1;
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
      `Unsupported argument: ${argument}. Supported flags: --filter <pattern>, --list, --permit-no-files, --update-goldens, --check-goldens, --trials <N>, --min-pass-rate <0-1>`,
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

  if ((updateGoldens || checkGoldens) && trialCount > 1) {
    throw new Error(
      "Golden operations require --trials 1 so snapshots stay deterministic.",
    );
  }

  return {
    filter,
    list,
    permitNoFiles,
    updateGoldens,
    checkGoldens,
    trialCount,
    minPassRate,
  };
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

/** writeStatsResults persists aggregated multi-trial pass rates to disk. */
async function writeStatsResults(result: EvalStatsResult): Promise<string> {
  const evalsDirectory = dirname(fromFileUrl(import.meta.url));
  const resultsDirectory = join(evalsDirectory, "results");
  const outputPath = join(resultsDirectory, "stats-latest.json");
  await ensureDir(resultsDirectory);
  await Deno.writeTextFile(outputPath, JSON.stringify(result, null, 2));
  return outputPath;
}

/** aggregateEvalStats computes per-case and per-assertion pass rates across trials. */
function aggregateEvalStats(
  selectedCases: EvalCaseDefinition[],
  trialResults: EvalCaseResult[][],
  provider: string,
  model: string,
  minPassRate?: number,
): EvalStatsResult {
  const casePassRates: EvalCasePassRate[] = selectedCases.map((testCase) => {
    const resultsForCase = trialResults.map((trial) =>
      trial.find((result) => result.id === testCase.id)
    );

    const assertionNames = [
      ...new Set(
        resultsForCase.flatMap((result) =>
          result?.assertions.map((assertion) => assertion.name) ?? []
        ),
      ),
    ];

    const assertionPassRates: EvalAssertionPassRate[] = assertionNames.map(
      (assertionName) => {
        let passCount = 0;
        let observedTrials = 0;

        for (const result of resultsForCase) {
          const assertion = result?.assertions.find((entry) =>
            entry.name === assertionName
          );
          if (!assertion) {
            continue;
          }
          observedTrials += 1;
          if (assertion.pass) {
            passCount += 1;
          }
        }

        const trialCount = observedTrials;
        return {
          name: assertionName,
          passCount,
          trialCount,
          passRate: trialCount === 0 ? 0 : passCount / trialCount,
        };
      },
    );

    const passCount = resultsForCase.filter((result) => result?.success).length;
    const trialCount = resultsForCase.length;

    return {
      id: testCase.id,
      description: testCase.description,
      passCount,
      trialCount,
      passRate: trialCount === 0 ? 0 : passCount / trialCount,
      assertionPassRates,
    };
  });

  const success = minPassRate === undefined
    ? casePassRates.every((caseRate) => caseRate.passRate === 1)
    : casePassRates.every((caseRate) => caseRate.passRate >= minPassRate);

  return {
    providerId: provider,
    modelId: model,
    timestamp: new Date().toISOString(),
    trialCount: trialResults.length,
    minPassRate,
    success,
    casePassRates,
  };
}

/** printStatsSummary renders aggregated pass rates for multi-trial runs. */
function printStatsSummary(statsResult: EvalStatsResult): void {
  console.log(`Trials per case: ${statsResult.trialCount}`);
  if (statsResult.minPassRate !== undefined) {
    console.log(`Minimum pass rate: ${statsResult.minPassRate}`);
  }
  console.log(`Statistical suite success: ${statsResult.success}`);
  console.log("");

  const requiredPassRate = statsResult.minPassRate ?? 1;
  for (const caseRate of statsResult.casePassRates) {
    const casePercent = (caseRate.passRate * 100).toFixed(1);
    console.log(
      `[${
        caseRate.passRate >= requiredPassRate ? "PASS" : "FAIL"
      }] ${caseRate.description} — case pass rate ${caseRate.passCount}/${caseRate.trialCount} (${casePercent}%)`,
    );
    for (const assertionRate of caseRate.assertionPassRates) {
      const assertionPercent = (assertionRate.passRate * 100).toFixed(1);
      console.log(
        `  - ${assertionRate.name}: ${assertionRate.passCount}/${assertionRate.trialCount} (${assertionPercent}%)`,
      );
    }
    console.log("");
  }
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
    await Deno.writeTextFile(
      outputPath,
      `${JSON.stringify(goldenResult, null, 2)}\n`,
    );
    writtenPaths.push(outputPath);
  }

  return writtenPaths;
}

/** validateGoldenUpdateInputs rejects failed or policy-invalid results before blessing. */
function validateGoldenUpdateInputs(
  suiteResult: EvalSuiteResult,
  selectedCases: EvalCaseDefinition[],
): void {
  const invalidCases: string[] = [];

  for (const testCase of selectedCases) {
    const caseResult = suiteResult.results.find((result) =>
      result.id === testCase.id
    );

    if (!caseResult) {
      invalidCases.push(`${testCase.id}: missing result`);
      continue;
    }

    if (!caseResult.success) {
      const failedAssertions = caseResult.assertions
        .filter((assertion) => !assertion.pass)
        .map((assertion) => assertion.name)
        .join(", ");
      invalidCases.push(
        `${testCase.id}: unsuccessful result${
          failedAssertions ? ` (${failedAssertions})` : ""
        }`,
      );
      continue;
    }

    const policyIssues = compareGoldenOutput(
      testCase,
      sanitizeGoldenCaseResult(caseResult),
      sanitizeGoldenCaseResult(caseResult),
    );
    if (policyIssues.length > 0) {
      invalidCases.push(`${testCase.id}: ${policyIssues[0].message}`);
    }
  }

  if (invalidCases.length > 0) {
    throw new Error(
      `Refusing to update golden snapshots for invalid results: ${
        invalidCases.join("; ")
      }`,
    );
  }
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
  validateProviderId(providerId);

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

  const trialSuiteResults: EvalSuiteResult[] = [];

  for (
    let trialIndex = 0;
    trialIndex < cliOptions.trialCount;
    trialIndex += 1
  ) {
    if (cliOptions.trialCount > 1) {
      console.log(`Trial ${trialIndex + 1}/${cliOptions.trialCount}`);
      console.log("");
    }

    const results = [];
    for (const testCase of selectedEvalCases) {
      const rawResult = await runEvalCase(testCase, { providerId, modelId });
      results.push(applyAssertions(rawResult));
    }

    trialSuiteResults.push({
      providerId,
      modelId,
      timestamp: new Date().toISOString(),
      success: results.every((result) => result.success),
      results,
    });
  }

  const suiteResult = trialSuiteResults[trialSuiteResults.length - 1];
  const statsResult = cliOptions.trialCount > 1
    ? aggregateEvalStats(
      selectedEvalCases,
      trialSuiteResults.map((trial) => trial.results),
      providerId,
      modelId,
      cliOptions.minPassRate,
    )
    : undefined;

  if (statsResult) {
    printStatsSummary(statsResult);
    const statsOutputPath = await writeStatsResults(statsResult);
    console.log(`Wrote statistical results to ${statsOutputPath}`);
  } else {
    printSummary(suiteResult);
  }

  const outputPath = await writeResults(suiteResult);
  console.log(`Wrote results to ${outputPath}`);

  if (cliOptions.updateGoldens) {
    validateGoldenUpdateInputs(suiteResult, selectedEvalCases);
    const writtenPaths = await writeGoldenSnapshots(
      suiteResult,
      selectedEvalCases,
    );
    for (const writtenPath of writtenPaths) {
      console.log(`Updated golden snapshot ${writtenPath}`);
    }
  }

  if (cliOptions.checkGoldens) {
    console.log(
      "Note: golden trajectories are representative snapshots; assertion results are the behavioral gate.",
    );
    const issues = await checkGoldenSnapshots(suiteResult, selectedEvalCases);
    printGoldenComparisonIssues(issues);
    if (issues.length > 0) {
      Deno.exitCode = 1;
    }
  }

  if (statsResult) {
    if (!statsResult.success) {
      Deno.exitCode = 1;
    }
  } else if (!suiteResult.success) {
    Deno.exitCode = 1;
  }
}
