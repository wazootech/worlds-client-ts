import { ensureDir } from "@std/fs";
import { dirname, fromFileUrl, join } from "@std/path";
import { runEvalCase } from "./agent-runner.ts";
import { applyAssertions } from "./assertions.ts";
import { evalCases } from "./test-cases.ts";
import type { EvalSuiteResult } from "./types.ts";

const providerId = "google";
const modelId = Deno.env.get("EVAL_MODEL_ID") ?? "gemini-2.5-flash";

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
  const results = [];
  for (const testCase of evalCases) {
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
