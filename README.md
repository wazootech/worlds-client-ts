# Wazoo Worlds

Worlds is the infrastructure layer for persistent, edge-native knowledge.

This repository implements a reactive, client-side semantic Graph Store backed
by SQLite (LibSQL), complete with an ACID-compliant client interface, hybrid
vector/keyword search indexing, and a Comunica-powered SPARQL engine.

## Key capabilities

- **Edge Persistence:** Epoxy-like SQLite graph persistence utilizing
  `@libsql/client`.
- **Hybrid Search:** Vector embeddings fused with Keyword Full-Text Search
  (FTS5).
- **ACID-Compliant Sync:** Automatic hydration and transactional mutation queue
  serialization.
- **Native Observability:** Full, zero-code OpenTelemetry hooks leveraging
  Deno's native telemetry runtime.

## Available examples

We provide several executable demonstration tasks out of the box:

### Hello world

A basic intro showing transient graph creation, SPARQL queries, and local
imports.

```bash
deno task example:hello-world
```

### LibSQL persistence

Introduces full disk-based synchronization and hydration from an embedded LibSQL
database file.

```bash
deno task example:libsql-hello-world
```

## Development workflow

All CI checks must pass before merging updates.

| Command          | Description                                             |
| :--------------- | :------------------------------------------------------ |
| `deno fmt`       | Automatically format all files using Deno formatter.    |
| `deno task lint` | Run static analysis and strict linter.                  |
| `deno task test` | Execute the unit test suite (50+ tests).                |
| `deno task ci`   | Run all checks sequentially (Fmt, Lint, Compile, Test). |

## License

This project is licensed under the terms listed in the [LICENSE](./LICENSE)
file.
