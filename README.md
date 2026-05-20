<p align="center">
  <a href="https://docs.wazoo.dev">
    <img src="https://wazoo.dev/assets/wazoo.svg" alt="Wazoo Worlds" width="120" />
  </a>
</p>

<p align="center">
  Worlds Client implements reactive, edge-native knowledge graph storage for agents.
</p>

<p align="center">
  <a href="https://jsr.io/@worlds/client"><img src="https://jsr.io/badges/@worlds/client" alt="JSR" /></a>
  <a href="https://jsr.io/@worlds/client/score"><img src="https://jsr.io/badges/@worlds/client/score" alt="JSR Score" /></a>
  <a href="https://github.com/wazootech/worlds-client-ts"><img src="https://img.shields.io/badge/GitHub-black?logo=github" alt="GitHub" /></a>
  <a href="https://deepwiki.com/wazootech/worlds-client-ts"><img src="https://deepwiki.com/badge.svg" alt="Ask DeepWiki" /></a>
</p>

Worlds is the infrastructure layer for persistent, edge-native knowledge. The
engine implements a edge-native semantic knowledge graph backed by transactional
persistence, complete with hybrid vector search and a standard SPARQL query
engine.

- **Reasoning:** Built-in SPARQL engine for declarative knowledge discovery.
- **Edge-Native:** Support for local SQLite (LibSQL) and stateless Deno Kv
  providers.
- **Hybrid Search:** Combines keyword FTS5 with vector embeddings for flexible
  recall.
- **Consistency:** Dual-layer sync and transactional mutation queue
  serialization.
- **Observability:** Native OpenTelemetry tracing support.

Worlds delivers these features through an open-source TypeScript SDK.

> [!IMPORTANT]
> Production recommendation: use Turso Cloud through `provideLibsql(...)` for
> production deployments and scale. The RDFJS-backed and Deno Kv-backed
> search/index paths, including topologies built around `RdfjsSearchIndex` and
> `DenokvSearchIndex`, are best suited to local development, tests, and
> constrained single-process demos. They are not the recommended production
> topology.

## Use Worlds

<table>
<tr>
<td width="50%" valign="top">

### Run locally

Explore transient and persistent graphs, run queries, and build knowledge.

ACID-compliant graph syncing.

[→ Quickstart Example](#quickstart)

<br>
</td>
<td width="50%" valign="top">

### Deploy to the edge

Enable lightweight, stateless graph execution via Deno Kv on the edge.

Best for prototypes, tests, and constrained single-process deployments rather
than the primary production recommendation.

[→ View Edge Benchmarks](https://github.com/wazootech/worlds-client-ts/issues/11)

<br>
</td>
</tr>
</table>

## Context for agents

The Worlds Client SDK provides agents with durable semantic context.

> [!IMPORTANT]
> Logical facts are technical descriptions of graph state. Worlds Client focuses
> on deterministic symbolic logic, managing explicit relationships to supply
> LLMs with verifiable symbolic reasoning.

### Instantiation

Compose your client using optimized persistence providers.

For production-scale deployments, prefer LibSQL-compatible infrastructure such
as Turso Cloud through `provideLibsql(...)`.

```typescript
import { Client } from "@worlds/client";
import { provideLibsql } from "@worlds/client/providers/libsql";
import { provideDenoKv } from "@worlds/client/providers/denokv";
import { createClient } from "@libsql/client";

// 1. In-Memory / Transient Graph (Default)
const client = new Client();

// 2. Local SQLite or Turso Persistence via LibSQL (recommended for production)
const db = createClient({ url: "file:./worlds.db" });
const sqliteClient = new Client(await provideLibsql({ client: db }));

// 3. Stateless Edge Deployment via Deno Kv
// Useful for prototyping and constrained edge flows, not the primary
// production recommendation for search/index workloads.
const kv = await Deno.openKv();
const kvClient = new Client(provideDenoKv({ kv }));
```

## Build with Worlds SDK

Include Worlds as your semantic context layer.

### Install

```bash
deno add jsr:@worlds/client
```

### Quickstart

```typescript
import { Client } from "@worlds/client";

const client = new Client();

// 1. Ingest structural Turtle data
await client.import({
  source: {
    kind: "serialized",
    contentType: "text/turtle",
    data: `
      @prefix ex: <http://example.org/> .
      ex:Alice ex:bio "Alice explores the depths." ;
               ex:location "Underdark" .
    `,
  },
});

// 2. Execute SPARQL query over the dataset
const response = await client.sparql({
  query: `
    SELECT ?bio WHERE {
      <http://example.org/Alice> <http://example.org/bio> ?bio .
    }
  `,
});

// 3. Perform Hybrid Text Search
const searchResults = await client.search({
  query: "explores",
});
```

## Run demonstrations

We provide preconfigured executable tasks demonstrating the architecture:

### In-memory hello world

Basic intro demonstrating graph composition and SPARQL queries.

```bash
deno task example:hello-world
```

### LibSQL persistence

Full disk-based synchronization, ACID mutations, and native FTS indexing.

This is the production-recommended path, including Turso Cloud deployments via
`provideLibsql(...)`.

```bash
deno task example:libsql-hello-world
```

### Stateless Deno Kv

Per-operation lazy hydration running in zero-maintenance edge contexts.

This path is useful for prototypes and constrained edge execution, but it is not
the recommended production topology when you need the full API surface and
search/index behavior at scale.

```bash
deno task example:denokv-hello-world
```

### AI SDK integration (Gemini + tools)

Wrap the Client as Vercel AI SDK tools for autonomous LLM reasoning.

```bash
deno task example:ai-sdk-hello-world
```

### Agent eval harness

Run the Deno-native eval harness for the AI SDK tool flow against a seeded
in-memory LibSQL world.

```bash
deno task evals
```

The eval runner defaults to the `google` provider with `gemini-3.1-flash-lite`.
`EVAL_MODEL_ID` can select a different Google model, and `EVAL_PROVIDER_ID`
currently accepts `google`.

Live evals use the Gemini API free tier unless the configured
`GOOGLE_GENERATIVE_AI_API_KEY` belongs to a paid-tier project. Free-tier quota
is enforced per Google Cloud project across requests per minute (`RPM`), input
tokens per minute (`TPM`), and requests per day (`RPD`); `RPD` resets at
midnight Pacific time. The public Gemini pricing page confirms that
`gemini-3.1-flash-lite` has free input/output tokens on the free tier, but it
does not list project-specific `RPM`, `TPM`, or `RPD` values. Those numeric
limits are visible only in the signed-in
[AI Studio rate-limit page](https://aistudio.google.com/rate-limit) for the
owning project. The current recorded `gemini-3.1-flash-lite` limits are
`15 RPM`, `250K TPM`, and `500 RPD`; see `evals/README.md` before raising
scheduled frequency or trial counts. Based on the eval cases and goldens
committed when the eval docs were last updated, a full-suite trial uses 26 model
requests in committed goldens and has a 38-request worst-case step budget. The
weekly `--trials 10` baseline should therefore currently be planned as 260
observed requests and 380 worst-case requests, paced over at least 18 to 26
minutes to avoid the `15 RPM` limit.

Rolling local eval output is written to `evals/results/latest.json` and is not
committed. Curated provider-generated golden snapshots live under
`evals/goldens/` so tool trajectories, final outputs, and assertion outcomes can
be reviewed without spending tokens again.

You can target eval cases using a Deno-test-like `--filter` flag:

```bash
deno task evals --list
deno task evals --filter happy-path
deno task evals --filter "/sparql|loop/i"
deno task evals --filter nonexistent --permit-no-files
```

Use explicit golden operations when you want to bless or verify committed
snapshots:

```bash
deno task evals --filter happy-path --update-goldens
deno task evals --filter happy-path --check-goldens
```

Golden files are committed once blessed. Run `--update-goldens` first to create
golden snapshots for a given case, then `--check-goldens` on subsequent runs to
detect regressions against the committed baseline.

Current eval case IDs:

- `happy-path-search-then-sparql`
- `sparql-updates-blocked`
- `avoid-excessive-tool-loops`

## Development workflow

All CI checks must pass before merging updates.

| Command           | Description                                  |
| :---------------- | :------------------------------------------- |
| `deno fmt`        | Format all code using native Deno formatter. |
| `deno task lint`  | Run strict static analysis checks.           |
| `deno task test`  | Execute comprehensive test suites.           |
| `deno task evals` | Run the agent eval harness.                  |
| `deno task ci`    | Run complete CI pipeline sequentially.       |

## Quicklinks

- [Documentation](https://docs.wazoo.dev)
- [Wazoo Technologies](https://wazoo.dev)
- [Support](https://github.com/wazootech/worlds-client-ts/issues)

Developed with [**@wazootech**](https://github.com/wazootech)
