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

## Environment

| Variable                       |    Required     | Default                 | Purpose                                         |
| :----------------------------- | :-------------: | :---------------------- | :---------------------------------------------- |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Yes (live runs) | —                       | Google Generative AI API key for `generateText` |
| `EVAL_PROVIDER_ID`             |       No        | `google`                | Provider label and golden filename segment      |
| `EVAL_MODEL_ID`                |       No        | `gemini-3.1-flash-lite` | Model id passed to the Google provider          |

Unit tests under `evals/*.test.ts` do not use these variables and run without an
API key.

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

Follow-ups tracked in
[issue #36](https://github.com/wazootech/worlds-client-ts/issues/36):
tool-recovery scenarios, additional guard verbs (`DROP`, `CLEAR`, `WITH`), and
scheduled trial runs once the scenario set stabilizes.

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
