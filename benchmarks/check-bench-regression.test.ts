import { assertEquals } from "@std/assert";
import {
  buildBaselinesFromReport,
  checkRegression,
  extractBenchJsonReport,
} from "./check-bench-regression.ts";

Deno.test("extractBenchJsonReport - skips preload log lines before JSON", () => {
  const stdout = `Pre-populating datasets...
ready.
{
  "version": 1,
  "runtime": "Deno/2.7.14 x86_64-pc-windows-msvc",
  "cpu": "unknown",
  "benches": [
    {
      "name": "Example Bench",
      "results": [{ "ok": { "n": 10, "min": 100, "max": 200, "avg": 150, "p75": 160, "p99": 190, "p995": 195, "p999": 200 } }]
    }
  ]
}`;
  const report = extractBenchJsonReport(stdout);
  assertEquals(report.benches[0].name, "Example Bench");
  assertEquals(report.benches[0].results[0]?.ok?.avg, 150);
});

Deno.test("checkRegression - fails when avg exceeds regression threshold", () => {
  const baselines = {
    version: 1,
    denoVersion: "2.7.14",
    capturedRuntime: "test",
    regressionThresholdPercent: 15,
    ciPlatformSlackPercent: 0,
    subsetSmoke: ["Example Bench"],
    benchmarks: { "Example Bench": 100 },
  };
  const report = {
    version: 1,
    runtime: "test",
    benches: [{
      name: "Example Bench",
      results: [{
        ok: {
          n: 1,
          min: 0,
          max: 0,
          avg: 200,
          p75: 0,
          p99: 0,
          p995: 0,
          p999: 0,
        },
      }],
    }],
  };
  const failures = checkRegression(report, baselines, { subset: "all" });
  assertEquals(failures.length, 1);
  assertEquals(failures[0].includes("Example Bench"), true);
});

Deno.test("checkRegression - all subset skips manual-only libsql pressure baselines", () => {
  const baselines = {
    version: 1,
    denoVersion: "2.7.14",
    capturedRuntime: "test",
    regressionThresholdPercent: 15,
    ciPlatformSlackPercent: 0,
    subsetSmoke: [],
    benchmarks: {
      "Write Pressure: Import 10 Quads (:memory:)": 1,
      "SPARQL Crossover: 1000 quads | selective | hydrate+N3": 100,
    },
  };
  const report = {
    version: 1,
    runtime: "test",
    benches: [{
      name: "SPARQL Crossover: 1000 quads | selective | hydrate+N3",
      results: [{
        ok: {
          n: 1,
          min: 0,
          max: 0,
          avg: 100,
          p75: 0,
          p99: 0,
          p995: 0,
          p999: 0,
        },
      }],
    }],
  };
  const failures = checkRegression(report, baselines, { subset: "all" });
  assertEquals(failures.length, 0);
});

Deno.test("buildBaselinesFromReport - records benchmark avgs in nanoseconds", () => {
  const baselines = buildBaselinesFromReport({
    version: 1,
    runtime: "Deno/2.7.14",
    benches: [{
      name: "Hydration Scale: 100 Quads from DB",
      results: [{
        ok: {
          n: 1,
          min: 0,
          max: 0,
          avg: 1_100_000,
          p75: 0,
          p99: 0,
          p995: 0,
          p999: 0,
        },
      }],
    }],
  });
  assertEquals(
    baselines.benchmarks["Hydration Scale: 100 Quads from DB"],
    1_100_000,
  );
  assertEquals(
    baselines.subsetSmoke.includes(
      "Hydration Scale: 100 Quads from DB",
    ),
    true,
  );
});
