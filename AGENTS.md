# Agent guidelines

## What this repo is

This repository contains the TypeScript Worlds data-plane client package,
generated from the Worlds API OpenAPI document.

## How to work here

- Treat OpenAPI synchronization and generated output as deliberate operations.
- Use `deno task ci` for normal validation (fmt, lint, type check, OpenAPI
  snapshot freshness).
- Run `deno task generate` to regenerate the client from `openapi/openapi.json`.
- Run `deno task sync:openapi` to refresh `openapi/openapi.json` from the Worlds
  API spec; never edit the snapshot by hand.
- Keep package exports, generated clients, and README examples aligned.

## Publishing

`@worlds/client` is published to JSR. Bump `version` in `deno.json` and merge to
`main` — `.github/workflows/publish.yml` runs on every push to `main`, compares
the local version against the published latest, and only releases when they
differ. No GitHub release is needed. A merge that does not bump the version
skips cleanly; a merge that bumps it but still results in "already published"
fails the job instead of passing silently. This mirrors the same workflow in
`sparql-engine`, `worlds-cloudflare`, and the other `@wazoo`/`@worlds` JSR
packages.
