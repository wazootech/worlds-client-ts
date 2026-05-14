# Wazoo Worlds

Worlds is the infrastructure layer for persistent, edge-native knowledge.

This repository implements a reactive, client-side semantic Graph Store backed
by SQLite (LibSQL), complete with an ACID-compliant client interface, hybrid
vector/keyword search indexing, a Comunica-powered SPARQL engine, and an
integrated **Vercel AI SDK Provider** for agentic LLM reasoning.

## Key capabilities

- **Edge Persistence:** Epoxy-like SQLite graph persistence utilizing
  `@libsql/client`.
- **Hybrid Search:** Vector embeddings fused with Keyword Full-Text Search
  (FTS5).
- **ACID-Compliant Sync:** Automatic hydration and transactional mutation queue
  serialization.
- **Agentic Tools:** Clean, type-safe integration wrapper (`createTools`)
  targeting the Vercel AI SDK.
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

### AI SDK agent (Gemini + tools)

Spins up a reactive client and attaches it as dynamic AI Tools to Google Gemini,
allowing the LLM to explore, search, and query the knowledge base autonomously.

```bash
# Setup your Gemini key in a local .env file (GEMINI_API_KEY=...)
deno task example:ai-sdk-hello-world
```

## Local benchmark observability (OpenTelemetry)

For local benchmark development, tracking token usage, duration, and
tool-calling performance is critical.

Because **Deno** features native runtime OpenTelemetry hooks, you can capture
full high-fidelity traces from the Vercel AI SDK **without adding any
boilerplate instrumentation code**.

### Configure your generation call

Just toggle `experimental_telemetry` on your agent loops in your source files:

```typescript
const output = await generateText({
  model: google("gemini-2.5-flash"),
  tools,
  prompt: "...",
  experimental_telemetry: {
    isEnabled: true,
    functionId: "knowledge_graph_benchmark",
  },
});
```

### Run with native telemetry logging

Pipe the structured OTel spans directly to your shell using Deno's native CLI
flags:

```bash
# PowerShell
$env:OTEL_DENO="true"; $env:OTEL_EXPORTER_OTLP_PROTOCOL="console"; deno task example:ai-sdk-hello-world

# Bash
OTEL_DENO=true OTEL_EXPORTER_OTLP_PROTOCOL=console deno task example:ai-sdk-hello-world
```

Your terminal will instantly print structured JSON spans tracking exactly how
many tokens were consumed by each recursive tool loop step, along with precise
microsecond latency measurements.

### Pipe to local Jaeger UI

To view traces visually, boot a local Jaeger container and point Deno at it via
HTTP:

```bash
$env:OTEL_DENO="true"; $env:OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318"; deno task example:ai-sdk-hello-world
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
