# Agent eval harness

Deno-native smoke harness for the AI SDK tool flow (`searchWorld`,
`executeSparql`) against a seeded in-memory LibSQL world. Live runs call a
credentialed Google model; deterministic assertion helpers and SPARQL guards are
covered by unit tests in this directory (`*.test.ts`).

Design direction: this stays a **targeted smoke harness**, not a general eval
framework. See
[issue #27](https://github.com/wazootech/worlds-client-ts/issues/27) for the
recorded decision (opaque genid fixture, fixture-specific assertions, golden
trajectories as representative snapshots).

## Evaluation policy

- Behavior-changing pull requests should include eval evidence appropriate to
  their risk: unit tests for deterministic harness logic, live smoke output for
  agent behavior changes, and multi-trial output when reliability is the claim.
- Deterministic assertions are the pass/fail gate. Prefer code checks over LLM
  judging for tool use, SPARQL handoff, grounding, guard behavior, and step
  budgets.
- Golden trajectories are review artifacts, not the primary correctness signal.
  Re-bless them only after the deterministic assertions pass.
- Incomplete, rate-limited, or credential-skipped live runs are operational
  signals only; do not cite them as benchmark evidence.
- Add real dogfooding failures back into `evals/test-cases.ts` and
  `evals/assertions.ts` so important regressions stay caught.
- Keep the current lane narrow: smoke harness now, candidate-style reliability
  checks with `--trials` when useful, and no formal benchmark claims until the
  scenario set and metrics are stable.

## Environment

| Variable                       |    Required     | Default                 | Purpose                                         |
| :----------------------------- | :-------------: | :---------------------- | :---------------------------------------------- |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Yes (live runs) | —                       | Google Generative AI API key for `generateText` |
| `EVAL_PROVIDER_ID`             |       No        | `google`                | Provider label and golden filename segment      |
| `EVAL_MODEL_ID`                |       No        | `gemini-3.1-flash-lite` | Model id passed to the Google provider          |

Unit tests under `evals/*.test.ts` do not use these variables and run without an
API key.

## Free-tier API limits

Live evals intentionally run on the Gemini API **Free** usage tier by default.
The default model is `gemini-3.1-flash-lite`, selected through `EVAL_MODEL_ID`
when no override is provided.

Google applies Gemini API free-tier limits per Google Cloud project, not per API
key. The public Gemini pricing page confirms free-tier cost and feature
availability for `gemini-3.1-flash-lite`, but it does **not** list the active
numeric `RPM`, `TPM`, or `RPD` quota values. Those values are visible only in
the signed-in
[AI Studio rate-limit page](https://aistudio.google.com/rate-limit) for the
project that owns `GOOGLE_GENERATIVE_AI_API_KEY`; they are not exposed in this
repository, in Google's unauthenticated docs, or in normal Gemini API response
headers.

The relevant quota dimensions for these evals are:

| Limit dimension | Meaning                 | Reset / window        |
| :-------------- | :---------------------- | :-------------------- |
| `RPM`           | Requests per minute     | Rolling minute        |
| `TPM`           | Input tokens per minute | Rolling minute        |
| `RPD`           | Requests per day        | Midnight Pacific time |

Exceeding any one of these limits fails the live run with a rate-limit error,
even when the other dimensions are still below quota.

Record the signed-in AI Studio values here whenever the eval API key changes.
The values below came from AI Studio's rate-limit table for the project that
owns the current eval key:

| `gemini-3.1-flash-lite` free-tier limit | Current value                                       | Source / notes                                                   |
| :-------------------------------------- | :-------------------------------------------------- | :--------------------------------------------------------------- |
| `RPM`                                   | `15`                                                | Text-out model requests per minute                               |
| `TPM`                                   | `250K`                                              | Text-out model input tokens per minute                           |
| `RPD`                                   | `500`                                               | Text-out model requests per day                                  |
| Last observed usage                     | `18 / 15 RPM`, `10.03K / 250K TPM`, `249 / 500 RPD` | AI Studio showed RPM over limit and other dimensions below limit |

Confirmed free-tier pricing and feature constraints for `gemini-3.1-flash-lite`:

| Feature                                 | Free-tier behavior                                                                                |
| :-------------------------------------- | :------------------------------------------------------------------------------------------------ |
| Standard input tokens                   | Free of charge                                                                                    |
| Standard output / thinking              | Free of charge                                                                                    |
| Batch input and output                  | Free of charge, but still subject to batch quotas                                                 |
| Flex input and output                   | Free of charge                                                                                    |
| Priority input and output               | Free of charge                                                                                    |
| Context caching                         | Not available                                                                                     |
| Google Search grounding                 | Not used by this harness; public pricing lists it as unavailable for this model's free tier       |
| Google Maps grounding                   | Not used by this harness; AI Studio shows a separate 500 RPD tool row for `gemini-3.1-flash-lite` |
| Content used to improve Google products | Yes                                                                                               |

Batch API limits are separate from interactive eval calls. Google currently
documents batch limits as 100 concurrent batch requests, 2 GB input file size,
and 20 GB file storage. This harness does not use the Batch API today.

### Effect on eval runs

Each eval case calls `generateText` once, but AI SDK tool loops can consume one
model request per step. Count the steps in golden trajectories for the observed
per-trial total and sum each case's `maxSteps` budget in `evals/test-cases.ts`
for the worst-case per-trial total. The examples below use 26 observed steps
and 38 worst-case steps — replace them if cases or budgets change. A
`--trials 10` full-suite run therefore uses 260 observed requests or 380
worst-case requests before retries or reruns.

Use these formulas when the active AI Studio quota values change. Replace
`O` with the observed golden step total and `W` with the worst-case
`maxSteps` sum:

```text
observed full-suite trials/day = floor(RPD / O)
safe full-suite trials/day     = floor(RPD / W)

observed scheduled runs/day = floor(RPD / (O * 10))
safe scheduled runs/day     = floor(RPD / (W * 10))

minimum observed scheduled runtime = O * 10 / RPM minutes
minimum safe scheduled runtime     = W * 10 / RPM minutes
```

With the recorded `500 RPD` quota and the example step totals (O = 26,
W = 38), the full-suite daily capacity is about 19 observed trials or 13 safe
worst-case trials. A `--trials 10` full-suite run fits inside the daily quota,
but it must be paced to stay below `15 RPM`: at least 18 minutes using 26
observed golden steps, or at least 26 minutes using 38 worst-case steps.

Example planning table, replace `RPD` with the signed-in AI Studio value if the
project quota changes:

| If `RPD` is | Observed trials/day | Safe trials/day | Observed `--trials 10` runs/day | Safe `--trials 10` runs/day |
| :---------- | ------------------: | --------------: | ------------------------------: | --------------------------: |
| `500`       |                  19 |              13 |                               1 |                           1 |
| `1,000`     |                  38 |              26 |                               3 |                           2 |
| `1,500`     |                  57 |              39 |                               5 |                           3 |

Operational policy while using the free tier:

- Keep scheduled evals at one weekly `--trials 10` baseline unless the active AI
  Studio quota has enough headroom for more frequent runs.
- Prefer `--filter <case>` for local debugging so a single change does not spend
  the full-suite quota.
- Treat rate-limited runs as operational signals only; they are not benchmark
  evidence and should not be used to bless goldens.
- If reliability work needs larger trial counts, first check the active project
  `RPM`, `TPM`, and `RPD` in AI Studio or move that run to a paid-tier project.

## Run

```bash
deno task evals
```

Equivalent to:

```bash
deno run -A --env ./evals/run-evals.ts
```

### Flags

| Flag                 | Description                                                                                     |
| :------------------- | :---------------------------------------------------------------------------------------------- |
| `--list`             | Print matching case ids and descriptions, then exit                                             |
| `--filter <pattern>` | Deno-test-like filter on case `id` or `description` (literal or `/regex/i`)                     |
| `--permit-no-files`  | Exit 0 when the filter matches no cases (default: error)                                        |
| `--update-goldens`   | Write blessed snapshots under `evals/goldens/` (requires `--filter`; case must pass assertions) |
| `--check-goldens`    | Compare run output to committed goldens (requires `--filter`)                                   |
| `--trials <N>`       | Run each selected case `N` times and aggregate pass rates (default `1`; alias `EVAL_TRIALS`)    |
| `--min-pass-rate`    | With `--trials`, require each case pass rate ≥ threshold (0–1); default requires 100%           |

Examples:

```bash
deno task evals --list
deno task evals --filter happy-path
deno task evals --filter "/sparql|distractor/i"
deno task evals --filter happy-path --update-goldens
deno task evals --filter happy-path --check-goldens
deno task evals --filter happy-path --trials 10
deno task evals --filter "/search-miss|delete-blocked/i" --trials 5 --min-pass-rate 0.8
```

## Output and exit codes

- **Summary:** per-case pass/fail, step count, tool names, assertion lines
  (stdout). With `--trials N > 1`, prints per-case and per-assertion pass rates
  instead.
- **Artifacts:**
  - `evals/results/latest.json` — last trial’s full suite JSON (gitignored)
  - `evals/results/stats-latest.json` — aggregated pass rates when
    `--trials > 1` (gitignored)
- **Exit code:** `0` when every selected case passes assertions (or meets
  `--min-pass-rate` across trials); `1` on failure or golden check mismatch.

Types for results and goldens: `evals/types.ts`.

## Epic status

[Issue #36](https://github.com/wazootech/worlds-client-ts/issues/36) is complete
for the phase-one scenario expansion scope. The harness now covers discovery
without embedded work URIs, SPARQL binding-level grounding, distractor
disambiguation, negative search misses, read-only SPARQL guard cases, alternate
question shape, unit-tested assertion helpers, committed goldens, and
multi-trial reliability output.

Remaining open eval work is tracked separately:

- [Issue #28](https://github.com/wazootech/worlds-client-ts/issues/28) — richer
  assertion diagnostics in result artifacts.
- [Issue #29](https://github.com/wazootech/worlds-client-ts/issues/29) — second
  fixture or schema shape to prove harness generality.
- [Issue #47](https://github.com/wazootech/worlds-client-ts/issues/47) — add the
  repository secret required for scheduled live evals.

## CI strategy

| Layer                   | Command                                     | API key                              | When                                 |
| :---------------------- | :------------------------------------------ | :----------------------------------- | :----------------------------------- |
| Harness unit tests      | `deno task ci` (includes `evals/*.test.ts`) | No                                   | Every push to `main`                 |
| Live agent evals        | `deno task evals`                           | Yes (`GOOGLE_GENERATIVE_AI_API_KEY`) | Local or manual dispatch             |
| Statistical reliability | `deno task evals -- --trials N`             | Yes                                  | Manual / scheduled credentialed runs |

**Default CI (`deno task ci`)** never calls the Google API. Assertion routing,
`isReadOnlySparqlQuery`, trajectory helpers, and SPARQL guards are covered by
`evals/assertions.test.ts`, `evals/tools.test.ts`, and
`evals/agent-runner.test.ts`.

**Credentialed evals** are opt-in: run locally with `.env`, trigger
[`.github/workflows/evals.yml`](../.github/workflows/evals.yml) via
`workflow_dispatch`, or rely on the **weekly schedule** (Monday 06:00 UTC,
`--trials 10` baseline) after configuring the `GOOGLE_GENERATIVE_AI_API_KEY`
repository secret. Golden snapshot checks are not a CI gate; behavioral
assertions are.

The original scenario-expansion epic is closed; use the follow-up issues above
for post-epic eval work.

## Permissions

The `evals` task uses **`-A` (`--allow-all`)** and **`--env`** so the runner can
read `.env`, open LibSQL, and reach the Google API. Unit tests are picked up by
`deno task test` / `deno task ci` with the same project-wide
`--allow-all --unstable-kv` settings.

## Goldens vs assertions

- **Golden files** (`evals/goldens/<case-id>.<provider>.<model>.json`) are
  representative snapshots of trajectories and outputs for review and optional
  `--check-goldens` regression diffs.
- **Assertions** (`evals/assertions.ts`, routed by case id in `applyAssertions`)
  are the behavioral pass/fail gate. A run can pass all assertions while goldens
  drift until you intentionally re-bless with `--update-goldens`.

## Eval cases

| Case id                                  | What it exercises                                                                                     |
| :--------------------------------------- | :---------------------------------------------------------------------------------------------------- |
| `happy-path-search-then-sparql`          | Search discovers work URI, SPARQL handoff, grounded house literal, correct final answer (max 5 steps) |
| `sparql-updates-blocked`                 | `INSERT` (and similar) rejected by read-only SPARQL guard                                             |
| `avoid-excessive-tool-loops`             | Required tools with tight step budget (max 3)                                                         |
| `discovery-efficient-search-then-sparql` | Search then one SPARQL SELECT; handoff and step cap (max 3)                                           |
| `distractor-work-disambiguation`         | Correct work/house despite second seeded work; must not answer with distractor house                  |
| `search-miss-unknown-label`              | Unknown label: must not invent house literal; handoff or final answer must not ground success         |
| `sparql-delete-blocked`                  | `DELETE` rejected by read-only SPARQL guard (guard-matrix sibling to `INSERT`)                        |
| `alternate-question-author`              | “Who wrote …?” resolves `AUTHOR_LITERAL` via search then SPARQL                                       |
| `no-tool-shortcut-resisted`              | Prompt forbids tools; agent must still call `searchWorld` and `executeSparql`                         |

Case definitions and prompts: `evals/test-cases.ts`. Seeded graph:
`evals/world-fixture.ts`.

## Layout

| Path              | Role                                                     |
| :---------------- | :------------------------------------------------------- |
| `run-evals.ts`    | CLI entry, filtering, golden update/check, `latest.json` |
| `agent-runner.ts` | One case execution via AI SDK                            |
| `tools.ts`        | Eval-isolated tools and SPARQL read-only guard           |
| `assertions.ts`   | Per-case deterministic assertions                        |
| `test-cases.ts`   | Scenario catalog                                         |
| `goldens/`        | Committed provider/model snapshots                       |
| `results/`        | Local run output (gitignored)                            |
