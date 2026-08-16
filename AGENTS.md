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
