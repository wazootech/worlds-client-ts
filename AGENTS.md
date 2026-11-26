# Agent guidelines

## What this repo is

This repository contains the TypeScript Worlds data-plane client package,
generated from the Worlds API OpenAPI document.

## Setup

Dependencies resolve through Bun. `package.json` is the toolchain manifest
(private; `jsr.json` describes the published package, and
`scripts/check-manifests.ts` keeps the two in sync). After cloning, run:

```sh
bun install
```

CI runs `bun install --frozen-lockfile --ignore-scripts` instead. Then validate
with `bun run ci`.

## How to work here

- Treat OpenAPI synchronization and generated output as deliberate operations.
- Use `bun run ci` for normal validation (fmt, lint, type check, tests,
  OpenAPI snapshot freshness).
- Run `bun run generate` to regenerate the client from `openapi/openapi.json`.
- Run `bun run sync:openapi` to refresh `openapi/openapi.json` from the Worlds
  API spec; never edit the snapshot by hand.
- Keep package exports, generated clients, and README examples aligned.

## Cross-repo impact

- You are consumed as a **published package**. A merged change here is not
  available to `wazoo-console` or `wazoo-cli` until it is published, so a
  downstream typecheck can fail against a stale published version even when
  every PR involved is correct. Say which published version downstream needs.
- The OpenAPI freshness check compares against `worlds-api/main`. If it fails
  because that snapshot predates an upstream merge, re-sync rather than editing
  the snapshot by hand.
- A `main` change in `worlds-api` that alters the World contract requires a
  follow-up here before console or CLI can typecheck against it.

## Code health

Family-wide rules live in the
[wazootech workspace constitution](https://github.com/wazootech/workspace/blob/main/AGENTS.md#code-health-standards);
this repo's specifics:

- Before pushing, run `bun run ci` (fmt, lint, check, test, OpenAPI snapshot).
- Never hand-edit `src/generated/` or `openapi/openapi.json`; regenerate them.
  `bun run openapi:check` fails CI when the snapshot is stale.
- `oxlint --deny-warnings` keeps `no-explicit-any` on; generated code is excluded from fmt,
  lint, and the code-health report.
- Actions are pinned to commit SHAs, and CI runs Bun on the `1.x` line.
- `secret-scan.yml` (gitleaks) runs on every PR; `code-health.yml` fails any
  hand-written source file over 120 lines of code (300 for tests; blank,
  comment, and import lines excluded; generated code and the OpenAPI snapshot
  are exempt; no allowlist entries) and warns about unlinked TODOs; `CODEOWNERS`
  assigns review.
- A client change is not available downstream until it is published, and
  publishing needs approval.
- Publishing runs `bunx jsr publish` on a GitHub release. The `jsr` CLI bundles
  its own Deno-based publisher and downloads it on first use, so a Deno install
  is not needed; the published package is still consumable from Deno, Node, and
  Bun, and the tests (`node:test`) run on all three.
