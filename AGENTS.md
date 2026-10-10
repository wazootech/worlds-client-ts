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
