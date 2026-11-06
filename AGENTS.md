# Agent guidelines

## What this repo is

This repository contains the TypeScript Worlds data-plane client package,
generated from the Worlds API OpenAPI document.

## Setup

Dependencies resolve through Deno (`nodeModulesDir: "auto"`); there is no
`package.json`, so do not run `npm install`. After cloning, run:

```sh
deno install
```

CI runs `deno ci` (a frozen-lockfile install) instead. Then validate with
`deno task ci`.

## How to work here

- Treat OpenAPI synchronization and generated output as deliberate operations.
- Use `deno task ci` for normal validation (fmt, lint, type check, OpenAPI
  snapshot freshness).
- Run `deno task generate` to regenerate the client from `openapi/openapi.json`.
- Run `deno task sync:openapi` to refresh `openapi/openapi.json` from the Worlds
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

- Before pushing, run `deno task ci` (fmt, lint, check, OpenAPI snapshot).
- Never hand-edit `src/generated/` or `openapi/openapi.json`; regenerate them.
  `deno task openapi:check` fails CI when the snapshot is stale.
- `deno lint` keeps `no-explicit-any` on; generated code is excluded from fmt,
  lint, and the code-health report.
- Actions are pinned to commit SHAs, and CI pins Deno to `v2.9.8`.
- `secret-scan.yml` (gitleaks) runs on every PR; `code-health.yml` only warns
  about file length and unlinked TODOs; `CODEOWNERS` assigns review.
- A client change is not available downstream until it is published, and
  publishing needs approval.
