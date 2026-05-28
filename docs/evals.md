## Eval policy

This repository uses local eval-driven development for agent behavior, retrieval
quality, workflow correctness, and safety regressions.

The eval system is organized around three components:

- datasets in `evals/*/questions.json` and `corpus.ttl`
- runners in `scripts/run-experiment.ts` and `evals/runner.ts`
- scorers in code and `evals/llm-scorer.ts`

The policy is designed for the current local-only workflow and current provider
constraints.

## Principles

- Prefer evidence over vibes when comparing prompts, models, and tool
  strategies.
- Quality beats quantity. A small curated eval set is better than a large noisy
  one.
- Prefer code-based grading whenever possible.
- Use LLM-based grading only when deterministic scoring is not practical.
- Add important failures back into the eval dataset so regressions stay caught.

## Eval lanes

This repository uses three eval lanes: `smoke`, `candidate`, and `formal`.

### Smoke evals

Smoke evals are for rapid local iteration.

Requirements:

- 5 to 20 representative questions
- 1 run per question
- free-tier or cheapest available judge model is allowed
- best-effort execution is acceptable

Smoke evals may fail due to provider rate limits and do not block development.
Smoke results must not be cited as benchmark evidence.

### Local model matrix

Use these models for cheap local eval work. The intent is to keep the lane
small, explicit, and predictable.

| Lane | Model id | Use for | Avoid for |
| --- | --- | --- | --- |
| Proof smoke | `mock:recall-smoke` | Runner sanity, CI proof runs, zero-cost regressions | Any real quality claim |
| Tool-use canary | `functiongemma` | Checking whether the tool loop and schema plumbing still work | Multi-turn realism or broad agent behavior |
| Main local tool model | `qwen3:8b` | Default local tool-calling smoke, routing, and recall checks | Final benchmark claims |
| Tool-specialist fallback | `llama3-groq-tool-use:8b` | Tool-calling regressions where you want a model trained specifically for function calling | General reasoning comparisons |
| Structured-output fallback | `ibm/granite4.1:8b` | JSON-heavy tasks, retrieval checks, and structured tool outputs | Best-in-class reasoning claims |
| General baseline | `llama3.1:8b` | Broad local baseline, especially if you want a stable comparison point | Cheapest possible runs |

Practical split:

- Use `mock:recall-smoke` for the fastest possible proof run.
- Use `functiongemma` when you only care about whether tool calling is wired
  correctly.
- Use `qwen3:8b` for most local iterations.
- Use `llama3-groq-tool-use:8b` when the eval is specifically about tool
  selection quality.
- Use `ibm/granite4.1:8b` when you need reliable structured output and
  conservative local behavior.
- Keep `llama3.1:8b` as a broad baseline when you want one general reference
  model in the matrix.

### Candidate evals

Candidate evals are for pull requests that may change agent behavior, retrieval
quality, workflow behavior, or safety behavior.

Requirements:

- 20 to 75 curated questions with class coverage
- stable experiment config saved in `experiments/`
- results saved under `results/<experiment>/<timestamp>/`
- incomplete runs must be labeled incomplete in PR discussion

Candidate evals are suitable for regression screening and internal decision
support. They are not suitable for public benchmark claims.

### Formal evals

Formal evals are for benchmark claims, release decisions, and architecture
comparisons.

Requirements:

- fixed curated gold set
- explicitly pinned judge model
- reproducible experiment config saved in `experiments/`
- saved local artifacts under `results/<experiment>/<timestamp>/`
- one formal run at a time on the local machine

Formal evals are currently local only and quota-constrained.

## Current provider constraints

Formal evals currently rely on 9Router/OpenRouter capacity. That means:

- formal runs are scarce and should be scheduled intentionally
- rate-limit failures do not count as benchmark results
- partial runs must not be cited as official evidence
- interrupted formal runs should be resumed or rerun before numbers are used in
  decision-making

`cc/claude-sonnet-4-6` is the default judge model for smoke-style local
verification, but formal experiments must still set `judgeModel` explicitly
rather than relying on the default scorer fallback.

Cloud-hosted tools like Zo Computer cannot reach `localhost`, so when running
from a remote client use `OPENROUTER_API_KEY` and set
`OPENROUTER_BASE_URL=https://openrouter.ai/api/v1` instead of the local 9Router
gateway.

## Scoring policy

Use `scoringMode: "code"` by default.

Use `scoringMode: "llm"` only when one of these is true:

- semantic correctness cannot be evaluated with exact or alias matching
- refusal quality is too nuanced for deterministic checks
- safety behavior cannot be captured by stable rule-based assertions

When adding LLM-judged cases, prefer a narrow rubric and keep the judged set as
small as possible.

## Dataset policy

Formal datasets should be small, curated, and high-signal.

They should cover the question classes already modeled in `evals/types.ts`:

- `parametric`
- `graph-fact`
- `workflow`
- `retrieval`
- `adversarial`
- `refusal`

Each formal dataset should include:

- straightforward happy-path cases
- ambiguous or hard cases
- previously observed failures
- adversarial or refusal cases when safety is in scope

Start small and grow the dataset by adding real failures from dogfooding,
benchmarks, or user feedback.

## Experiment naming

Use experiment names that communicate the eval lane.

Recommended naming:

- `*-smoke.ts` for rapid local iteration
- `*-candidate.ts` for PR-level screening
- `*-formal.ts` for decision-grade local benchmark runs

Formal experiments must pin `judgeModel` directly in the experiment config.

## Run expectations

### Smoke

- free-tier defaults are acceptable
- `smokeQuestionLimit` is encouraged
- reruns are fine
- rate-limit errors are expected operational noise

Fast local micro smoke commands:

```bash
deno run -A --env scripts/run-experiment.ts --model "mock:recall-smoke" --condition "without-tools" --question-limit 1 recall-smoke
```

```bash
deno run -A --env scripts/run-experiment.ts --model "cc/claude-sonnet-4-6" --condition "with-tools" --question-limit 1 recall-router-formal
```

These commands use the runner overrides for `--model`, `--condition`, and
`--question-limit` so local smoke loops stay small and fast.

Use the router-backed candidate/formal recall lanes in
`experiments/recall-router-*.ts` for active recall benchmarking. The smoke lane
uses a deterministic local mock for quick proof runs.

### Candidate

- use a curated subset rather than all available questions
- avoid launching many experiments back to back
- rerun once if a provider rate limit interrupts the run
- treat incomplete output as non-authoritative

### Formal

- run one experiment at a time locally
- avoid concurrent benchmark sessions against the same provider window
- preserve artifacts for every completed run
- do not publish partial or rate-limited runs as official benchmark evidence
- prefer the router-backed `recall-router-formal` lane for decision-grade runs

## Pull request guidance

Pull requests that change agent behavior should include eval evidence
appropriate to the risk of the change.

Recommended guidance:

- use smoke evals for routine iteration
- use candidate evals for behavior-changing pull requests
- use formal evals only when making benchmark, release, or architecture claims

Because the workflow is local-first, evals are not required on every pull
request. They are required whenever the pull request makes claims about model,
tooling, retrieval, or safety performance.

## Next implementation steps

This policy documents current operating rules. Future improvements should focus
on making local formal evals more reliable without increasing cost too quickly.

Priority order:

- convert more evals from `llm` scoring to `code` scoring
- introduce dedicated `*-candidate.ts` and `*-formal.ts` experiment configs
- add resumable formal runs
- add caching for deterministic judge inputs
- add explicit concurrency controls for formal runs
