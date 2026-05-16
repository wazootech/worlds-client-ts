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

Formal evals currently rely on Hugging Face free-tier capacity. That means:

- formal runs are scarce and should be scheduled intentionally
- rate-limit failures do not count as benchmark results
- partial runs must not be cited as official evidence
- interrupted formal runs should be resumed or rerun before numbers are used in
  decision-making

`huggingface:Qwen/Qwen2.5-7B-Instruct` is the default judge model for
smoke-style local verification, but formal experiments must still set
`judgeModel` explicitly rather than relying on the default scorer fallback.

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
deno run -A --env scripts/run-experiment.ts --model "huggingface:Qwen/Qwen2.5-7B-Instruct" --condition "without-tools" --question-limit 1 recall-smoke
```

```bash
deno run -A --env scripts/run-experiment.ts --model "huggingface:Qwen/Qwen2.5-7B-Instruct" --condition "with-tools" --question-limit 1 recall-smoke
```

```bash
deno run -A --env scripts/run-experiment.ts --model "huggingface:Qwen/Qwen2.5-7B-Instruct" --condition "without-tools" --question-limit 1 recall-huggingface-smoke
```

```bash
deno run -A --env scripts/run-experiment.ts --model "huggingface:Qwen/Qwen2.5-7B-Instruct" --condition "with-tools" --question-limit 1 recall-huggingface-smoke
```

These commands use the runner overrides for `--model`, `--condition`, and
`--question-limit` so local smoke loops stay small and fast.

Google `with-tools` runs may still fail when the current Gemini API key has no
remaining quota. That is a provider quota issue rather than an eval harness
compatibility issue.

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
