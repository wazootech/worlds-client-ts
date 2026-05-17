import { parseArgs } from "@std/cli/parse-args";
import * as colors from "@std/fmt/colors";

/**
 * SummaryResult represents the structure of a summary.json file.
 */
interface SummaryResult {
  experimentName: string;
  timestamp: string;
  durationMs: number;
  models: ModelResult[];
}

/**
 * ModelResult represents the performance of a specific model in a specific condition.
 */
interface ModelResult {
  model: string;
  condition: string;
  accuracy: number;
  toolUsageRate: number;
  exactMatches: number;
  aliasMatches: number;
  wrongMatches: number;
}

const USAGE = `
Usage: deno run -A scripts/compare-evals.ts <baseline-summary.json> <candidate-summary.json> [options]

Options:
  -h, --help            Show this help message
  --threshold <num>     Fail if accuracy drop exceeds threshold (default: 0.05)
  --json                Output result as JSON
`;

/**
 * compareEvals performs a deep diff between two evaluation summaries.
 */
async function compareEvals() {
  const parsed = parseArgs(Deno.args, {
    boolean: ["help", "json"],
    string: ["threshold"],
    alias: { help: "h" },
  });

  if (parsed.help || parsed._.length < 2) {
    console.log(USAGE);
    Deno.exit(0);
  }

  const baselinePath = String(parsed._[0]);
  const candidatePath = String(parsed._[1]);
  const threshold = parseFloat(parsed.threshold ?? "0.05");

  const baseline: SummaryResult = JSON.parse(
    await Deno.readTextFile(baselinePath),
  );
  const candidate: SummaryResult = JSON.parse(
    await Deno.readTextFile(candidatePath),
  );

  const results: Record<string, unknown>[] = [];
  let regressionFound = false;

  // Index candidate results for fast lookup
  const candidateMap = new Map<string, ModelResult>();
  for (const res of candidate.models) {
    candidateMap.set(`${res.model}|${res.condition}`, res);
  }

  console.log(`\n${colors.bold("Evaluation Comparison Report")}`);
  console.log(`Experiment: ${baseline.experimentName}`);
  console.log(`Baseline:  ${baselinePath} (${baseline.timestamp})`);
  console.log(`Candidate: ${candidatePath} (${candidate.timestamp})\n`);

  const header = `| ${"Model".padEnd(20)} | ${"Condition".padEnd(15)} | ${
    "Baseline Acc".padEnd(12)
  } | ${"Cand. Acc".padEnd(12)} | ${"Delta".padEnd(8)} |`;
  const divider = `| ${"-".repeat(20)} | ${"-".repeat(15)} | ${
    "-".repeat(12)
  } | ${"-".repeat(12)} | ${"-".repeat(8)} |`;

  if (!parsed.json) {
    console.log(header);
    console.log(divider);
  }

  for (const b of baseline.models) {
    const key = `${b.model}|${b.condition}`;
    const c = candidateMap.get(key);

    if (!c) {
      if (!parsed.json) {
        console.log(
          `| ${b.model.padEnd(20)} | ${b.condition.padEnd(15)} | ${
            b.accuracy.toFixed(2).padEnd(12)
          } | ${"MISSING".padEnd(12)} | ${"N/A".padEnd(8)} |`,
        );
      }
      continue;
    }

    const delta = c.accuracy - b.accuracy;
    const deltaStr = (delta >= 0 ? "+" : "") + delta.toFixed(2);

    let deltaColored = deltaStr;
    if (delta > 0) deltaColored = colors.green(deltaStr);
    if (delta < 0) deltaColored = colors.red(deltaStr);

    if (delta < -threshold) {
      regressionFound = true;
    }

    if (!parsed.json) {
      console.log(
        `| ${b.model.padEnd(20)} | ${b.condition.padEnd(15)} | ${
          b.accuracy.toFixed(2).padEnd(12)
        } | ${c.accuracy.toFixed(2).padEnd(12)} | ${deltaColored.padEnd(17)} |`,
      );
    }

    results.push({
      model: b.model,
      condition: b.condition,
      baseline: b.accuracy,
      candidate: c.accuracy,
      delta: delta,
    });
  }

  if (parsed.json) {
    console.log(
      JSON.stringify(
        { experiment: baseline.experimentName, results, regressionFound },
        null,
        2,
      ),
    );
  }

  if (regressionFound) {
    console.log(
      `\n${
        colors.red(colors.bold("❌ REGRESSION DETECTED"))
      }: One or more models dropped below the threshold of ${threshold}.`,
    );
    Deno.exit(1);
  } else {
    console.log(
      `\n${
        colors.green(colors.bold("✅ SUCCESS"))
      }: No significant regressions found.`,
    );
  }
}

if (import.meta.main) {
  compareEvals();
}
