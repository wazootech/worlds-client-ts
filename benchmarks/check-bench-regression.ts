/**
 * checkBenchRegression compares `deno bench --json` output against committed baselines.
 *
 * Usage:
 *   deno run -A benchmarks/check-bench-regression.ts
 *   deno run -A benchmarks/check-bench-regression.ts --update-baselines
 *   deno run -A benchmarks/check-bench-regression.ts --bench-json ./bench-output.json
 *   deno run -A benchmarks/check-bench-regression.ts --subset smoke
 */

/** ParsedCliArguments holds CLI flags for check-bench-regression. */
interface ParsedCliArguments {
  help: boolean;
  updateBaselines: boolean;
  benchJson?: string;
  baselines?: string;
  subset: "all" | "smoke";
}

/**
 * parseCliArguments parses process arguments for check-bench-regression.
 */
function parseCliArguments(argumentsList: string[]): ParsedCliArguments {
  const parsed: ParsedCliArguments = {
    help: false,
    updateBaselines: false,
    subset: "all",
  };
  for (let index = 0; index < argumentsList.length; index++) {
    const argument = argumentsList[index];
    if (argument === "--help" || argument === "-h") parsed.help = true;
    else if (argument === "--update-baselines") parsed.updateBaselines = true;
    else if (argument === "--bench-json") {
      parsed.benchJson = argumentsList[++index];
    } else if (argument === "--baselines") {
      parsed.baselines = argumentsList[++index];
    } else if (argument === "--subset") {
      const value = argumentsList[++index];
      if (value === "smoke" || value === "all") parsed.subset = value;
    }
  }
  return parsed;
}

/** BenchJsonOk is the successful timing payload from deno bench --json. */
interface BenchJsonOk {
  n: number;
  min: number;
  max: number;
  avg: number;
  p75: number;
  p99: number;
  p995: number;
  p999: number;
}

/** BenchJsonEntry is one benchmark row from deno bench --json. */
interface BenchJsonEntry {
  name: string;
  group?: string;
  results: Array<{ ok?: BenchJsonOk; failed?: unknown }>;
}

/** BenchJsonReport is the root object emitted by deno bench --json. */
interface BenchJsonReport {
  version: number;
  runtime: string;
  benches: BenchJsonEntry[];
}

/** BenchBaselinesFile is the committed regression reference for CI. */
export interface BenchBaselinesFile {
  /** version is the baselines file schema version. */
  version: number;
  /** denoVersion is the Deno runtime used when baselines were captured. */
  denoVersion: string;
  /** capturedRuntime is the full runtime string from deno bench --json. */
  capturedRuntime: string;
  /** regressionThresholdPercent is the max allowed slowdown vs baseline avg (same OS). */
  regressionThresholdPercent: number;
  /**
   * ciPlatformSlackPercent is extra allowance when CI=true (Linux vs reference capture).
   * Re-capture baselines on ubuntu-latest to reduce this slack.
   */
  ciPlatformSlackPercent: number;
  /** subsetSmoke lists benchmark names included in the smoke subset (PR checks). */
  subsetSmoke: string[];
  /** benchmarks maps deno bench `name` to baseline avg in nanoseconds. */
  benchmarks: Record<string, number>;
}

const DEFAULT_BASELINES_PATH = new URL("./baselines.ci.json", import.meta.url);
const DEFAULT_REGRESSION_THRESHOLD_PERCENT = 15;
const DEFAULT_CI_PLATFORM_SLACK_PERCENT = 25;

/** allBenchFiles lists benchmark modules captured one at a time for --update-baselines. */
const allBenchFiles = [
  "benchmarks/denokv-pressure.bench.ts",
  "benchmarks/libsql-pressure.bench.ts",
  "benchmarks/search-comparison.bench.ts",
  "benchmarks/sparql-hexastore-crossover.bench.ts",
] as const;

/**
 * smokeBenchFiles lists modules run for PR smoke checks (excludes libsql-pressure
 * on hosts where deno bench --json crashes after heavy preload; full CI on Linux
 * runs all files via bench:check).
 */
const smokeBenchFiles = [
  "benchmarks/denokv-pressure.bench.ts",
  "benchmarks/search-comparison.bench.ts",
  "benchmarks/sparql-hexastore-crossover.bench.ts",
] as const;

/** smokeBenchNamePatterns match fast benches for pull request CI. */
const smokeBenchNamePatterns: RegExp[] = [
  /^Write Pressure: Import 10 Quads/,
  /^Hydration Scale: 100 Quads from DB$/,
  /^Deno Kv Hydration: 100 Quads from DB$/,
  /^Search Queries: Specific Unique Keyword/,
  /^Search: hit after full 2k KV scan/,
  /^Scale 100: LibSQL Specific Match/,
  /^SPARQL Crossover: 1000 quads \| selective \|/,
];

/**
 * extractBenchJsonReport parses deno bench stdout, skipping preload log lines.
 */
export function extractBenchJsonReport(stdout: string): BenchJsonReport {
  const normalizedStdout = stdout.charCodeAt(0) === 0xfeff
    ? stdout.slice(1)
    : stdout;
  const jsonMatch = normalizedStdout.match(
    /\{\s*"version"\s*:\s*1[\s\S]*\}\s*$/,
  );
  if (!jsonMatch) {
    throw new Error(
      "checkBenchRegression: could not find JSON report in bench output",
    );
  }
  return JSON.parse(jsonMatch[0]) as BenchJsonReport;
}

/**
 * collectBenchReportFromFiles runs each benchmark file and merges JSON rows.
 */
async function collectBenchReportFromFiles(
  benchFiles: readonly string[],
): Promise<BenchJsonReport> {
  let combinedReport: BenchJsonReport | undefined;
  for (const benchFile of benchFiles) {
    const fileStdout = await runDenoBenchJson([benchFile]);
    const fileReport = extractBenchJsonReport(fileStdout);
    if (!combinedReport) {
      combinedReport = fileReport;
    } else {
      combinedReport.benches.push(...fileReport.benches);
    }
  }
  if (!combinedReport) {
    throw new Error("checkBenchRegression: no benchmarks produced output");
  }
  return combinedReport;
}

/**
 * runDenoBenchJson executes deno bench --json for the given benchmark paths.
 */
async function runDenoBenchJson(benchPaths: string[]): Promise<string> {
  const command = new Deno.Command(Deno.execPath(), {
    args: [
      "bench",
      "--allow-all",
      "--unstable-kv",
      "--json",
      ...benchPaths,
    ],
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stdout, stderr } = await command.output();
  const stdoutText = new TextDecoder().decode(stdout);
  const stderrText = new TextDecoder().decode(stderr);
  if (code !== 0) {
    throw new Error(
      `deno bench failed (exit ${code}):\n${stderrText}\n${stdoutText}`,
    );
  }
  return stdoutText + (stderrText.includes("{") ? `\n${stderrText}` : "");
}

/**
 * buildBaselinesFromReport constructs a baselines file from a bench JSON report.
 */
export function buildBaselinesFromReport(
  report: BenchJsonReport,
): BenchBaselinesFile {
  const benchmarks: Record<string, number> = {};
  const subsetSmoke: string[] = [];

  for (const entry of report.benches) {
    const ok = entry.results[0]?.ok;
    if (!ok) continue;
    benchmarks[entry.name] = ok.avg;
    if (smokeBenchNamePatterns.some((pattern) => pattern.test(entry.name))) {
      subsetSmoke.push(entry.name);
    }
  }

  const denoVersionMatch = report.runtime.match(/Deno\/([\d.]+)/);
  const denoVersion = denoVersionMatch?.[1] ?? "unknown";

  return {
    version: 1,
    denoVersion,
    capturedRuntime: report.runtime,
    regressionThresholdPercent: DEFAULT_REGRESSION_THRESHOLD_PERCENT,
    ciPlatformSlackPercent: DEFAULT_CI_PLATFORM_SLACK_PERCENT,
    subsetSmoke,
    benchmarks,
  };
}

/**
 * loadBaselines reads the committed baselines JSON file.
 */
async function loadBaselines(path: URL): Promise<BenchBaselinesFile> {
  const text = await Deno.readTextFile(path);
  return JSON.parse(text) as BenchBaselinesFile;
}

/**
 * mergeBaselines combines an existing baselines file with a fresh partial capture.
 */
export function mergeBaselines(
  existingBaselines: BenchBaselinesFile,
  freshBaselines: BenchBaselinesFile,
): BenchBaselinesFile {
  const mergedSmoke = [
    ...new Set([
      ...existingBaselines.subsetSmoke,
      ...freshBaselines.subsetSmoke,
    ]),
  ];
  return {
    ...existingBaselines,
    denoVersion: freshBaselines.denoVersion,
    capturedRuntime: freshBaselines.capturedRuntime,
    subsetSmoke: mergedSmoke,
    benchmarks: {
      ...existingBaselines.benchmarks,
      ...freshBaselines.benchmarks,
    },
  };
}

/**
 * writeBaselines persists baselines to disk with trailing newline.
 */
async function writeBaselines(
  path: URL,
  baselines: BenchBaselinesFile,
): Promise<void> {
  await Deno.writeTextFile(
    path,
    `${JSON.stringify(baselines, null, 2)}\n`,
  );
}

/**
 * maxAllowedNanoseconds computes the fail threshold for a baseline avg.
 */
function maxAllowedNanoseconds(
  baselineNanoseconds: number,
  baselines: BenchBaselinesFile,
): number {
  const regressionMultiplier = 1 +
    baselines.regressionThresholdPercent / 100;
  const ciSlackMultiplier = Deno.env.get("CI") === "true"
    ? 1 + baselines.ciPlatformSlackPercent / 100
    : 1;
  return baselineNanoseconds * regressionMultiplier * ciSlackMultiplier;
}

/**
 * checkRegression compares report against baselines; returns failure messages.
 */
export function checkRegression(
  report: BenchJsonReport,
  baselines: BenchBaselinesFile,
  options: { subset: "all" | "smoke" },
): string[] {
  const failures: string[] = [];
  const namesToCheck = options.subset === "smoke"
    ? baselines.subsetSmoke
    : Object.keys(baselines.benchmarks);

  const reportByName = new Map(
    report.benches.map((entry) => [entry.name, entry]),
  );

  for (const name of namesToCheck) {
    const expectedNanoseconds = baselines.benchmarks[name];
    if (expectedNanoseconds === undefined) {
      failures.push(`missing baseline entry for benchmark "${name}"`);
      continue;
    }

    const entry = reportByName.get(name);
    const actualNanoseconds = entry?.results[0]?.ok?.avg;
    if (actualNanoseconds === undefined) {
      failures.push(`benchmark "${name}" missing or failed in bench output`);
      continue;
    }

    const limit = maxAllowedNanoseconds(expectedNanoseconds, baselines);
    if (actualNanoseconds > limit) {
      const percentOver = ((actualNanoseconds / expectedNanoseconds) - 1) * 100;
      failures.push(
        `"${name}": avg ${formatNanoseconds(actualNanoseconds)} > limit ${
          formatNanoseconds(limit)
        } (baseline ${formatNanoseconds(expectedNanoseconds)}, +${
          percentOver.toFixed(1)
        }%)`,
      );
    }
  }

  return failures;
}

/**
 * formatNanoseconds renders a duration for human-readable CI logs.
 */
function formatNanoseconds(nanoseconds: number): string {
  if (nanoseconds < 1_000) return `${nanoseconds.toFixed(0)} ns`;
  if (nanoseconds < 1_000_000) {
    return `${(nanoseconds / 1_000).toFixed(1)} µs`;
  }
  if (nanoseconds < 1_000_000_000) {
    return `${(nanoseconds / 1_000_000).toFixed(2)} ms`;
  }
  return `${(nanoseconds / 1_000_000_000).toFixed(2)} s`;
}

if (import.meta.main) {
  const parsedArguments = parseCliArguments(Deno.args);

  if (parsedArguments.help) {
    console.log(`Usage:
  deno run -A benchmarks/check-bench-regression.ts
  deno run -A benchmarks/check-bench-regression.ts --update-baselines
  deno run -A benchmarks/check-bench-regression.ts --bench-json ./out.json
  deno run -A benchmarks/check-bench-regression.ts --subset smoke`);
    Deno.exit(0);
  }

  const baselinesPath = parsedArguments.baselines
    ? new URL(parsedArguments.baselines, `file://${Deno.cwd()}/`)
    : DEFAULT_BASELINES_PATH;

  const subset = parsedArguments.subset;

  if (parsedArguments.updateBaselines && !parsedArguments.benchJson) {
    console.log("Capturing baselines per benchmark file...");
    let mergedBaselines: BenchBaselinesFile | undefined;
    for (const benchFile of allBenchFiles) {
      console.log(`  - ${benchFile}`);
      const stdout = await runDenoBenchJson([benchFile]);
      const report = extractBenchJsonReport(stdout);
      const freshBaselines = buildBaselinesFromReport(report);
      mergedBaselines = mergedBaselines
        ? mergeBaselines(mergedBaselines, freshBaselines)
        : freshBaselines;
    }
    if (!mergedBaselines) {
      throw new Error("checkBenchRegression: no benchmarks captured");
    }
    await writeBaselines(baselinesPath, mergedBaselines);
    console.log(
      `Wrote ${
        Object.keys(mergedBaselines.benchmarks).length
      } baselines to ${baselinesPath.pathname}`,
    );
    Deno.exit(0);
  }

  let stdout: string;
  if (parsedArguments.benchJson) {
    const benchJsonPath = parsedArguments.benchJson.startsWith("benchmarks/")
      ? parsedArguments.benchJson
      : parsedArguments.benchJson;
    stdout = await Deno.readTextFile(benchJsonPath);
  } else if (subset === "smoke") {
    console.log("Running deno bench --json (smoke subset)...");
    stdout = JSON.stringify(
      await collectBenchReportFromFiles(smokeBenchFiles),
    );
  } else {
    console.log("Running deno bench --json (all benchmarks)...");
    stdout = JSON.stringify(
      await collectBenchReportFromFiles(allBenchFiles),
    );
  }

  const report = extractBenchJsonReport(stdout);

  if (parsedArguments.updateBaselines) {
    const freshBaselines = buildBaselinesFromReport(report);
    let mergedBaselines = freshBaselines;
    try {
      const existingBaselines = await loadBaselines(baselinesPath);
      mergedBaselines = mergeBaselines(existingBaselines, freshBaselines);
    } catch {
      // No existing file — write fresh capture only.
    }
    await writeBaselines(baselinesPath, mergedBaselines);
    console.log(
      `Wrote ${
        Object.keys(mergedBaselines.benchmarks).length
      } baselines to ${baselinesPath.pathname}`,
    );
    Deno.exit(0);
  }

  const baselines = await loadBaselines(baselinesPath);
  const failures = checkRegression(report, baselines, { subset });

  if (failures.length > 0) {
    console.error("Benchmark regression check failed:\n");
    for (const failure of failures) {
      console.error(`  - ${failure}`);
    }
    console.error(
      "\nUpdate baselines after intentional change: deno task bench:baselines",
    );
    Deno.exit(1);
  }

  console.log(
    `Benchmark regression check passed (${
      namesToCheckCount(baselines, subset)
    } benchmarks, subset=${subset}).`,
  );
}

function namesToCheckCount(
  baselines: BenchBaselinesFile,
  subset: "all" | "smoke",
): number {
  return subset === "smoke"
    ? baselines.subsetSmoke.length
    : Object.keys(baselines.benchmarks).length;
}
