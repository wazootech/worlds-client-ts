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
  adapters.
- **Hybrid Search:** Combines keyword FTS5 with vector embeddings for flexible
  recall.
- **Consistency:** Dual-layer sync and transactional mutation queue
  serialization.
- **Observability:** Native OpenTelemetry tracing support.

Worlds delivers these features through an open-source TypeScript SDK.

> [!IMPORTANT]
> Production recommendation: use Turso Cloud through `createLibsqlClient(...)`
> for production deployments and scale. The RDFJS-backed and Deno Kv-backed
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

Compose your client using optimized persistence adapters.

For production-scale deployments, prefer LibSQL-compatible infrastructure such
as Turso Cloud through `createLibsqlClient(...)`.

```typescript
import { createRdfjsClient } from "@worlds/client/adapters/rdfjs";
import { ComunicaSparqlEngine } from "@worlds/client/adapters/comunica";
import { createLibsqlClient } from "@worlds/client/adapters/libsql";
import { createDenokvClient } from "@worlds/client/adapters/denokv";
import { createClient } from "@libsql/client";
import { QueryEngine } from "@comunica/query-sparql-rdfjs-lite";

// 1. In-Memory / Transient Graph (Default)
const client = createRdfjsClient();

// 2. Local SQLite or Turso Persistence via LibSQL (recommended for production)
const db = createClient({ url: "file:./worlds.db" });
const sqliteClient = await createLibsqlClient({ client: db });

// 2b. Attach SPARQL explicitly when needed
const queryEngine = new QueryEngine();
const sqliteClientWithSparql = await createLibsqlClient({
  client: db,
  createSparqlEngine: ({ store }) =>
    new ComunicaSparqlEngine({ queryEngine, store }),
});

// 3. Stateless Edge Deployment via Deno Kv
// Useful for prototyping and constrained edge flows, not the primary
// production recommendation for search/index workloads.
const kv = await Deno.openKv();
const kvClient = createDenokvClient({ kv });
```

#### Advanced composition

Use `*ClientOptions` builders when you need `ClientOptions` without constructing
`Client` (for example, rebuilding a client from the same wiring in tests):

```typescript
import { Client } from "@worlds/client";
import { createLibsqlClientOptions } from "@worlds/client/adapters/libsql";
import { createRdfjsClientOptions } from "@worlds/client/adapters/rdfjs";
import { createDenokvClientOptions } from "@worlds/client/adapters/denokv";

const client = new Client(await createLibsqlClientOptions({ client: db }));
const inMemoryOptions = createRdfjsClientOptions({ store: warmedStore });
```

## Build with Worlds SDK

Include Worlds as your semantic context layer.

### Install

```bash
deno add jsr:@worlds/client
```

### Quickstart

```typescript
import { createRdfjsClient } from "@worlds/client/adapters/rdfjs";

const client = createRdfjsClient();

// 1. Ingest structural Turtle data
await client.import({
  source: {
    kind: "serialized",
    contentType: "text/turtle",
    data: `@prefix ex: <http://example.org/> .
      ex:Alice ex:bio "Alice explores the depths." ;
               ex:location "Underdark" .`,
  },
});

// 2. Perform hybrid text search over the graph
const searchResults = await client.search({ query: "explores" });
```

## Run demonstrations

We provide preconfigured executable tasks demonstrating the architecture:

### In-memory hello world

Basic intro demonstrating graph composition and SPARQL queries.

```bash
deno task example:hello-world
```

### LibSQL persistence

Full disk-based synchronization, ACID mutations, hybrid FTS + vector search, and
optional SPARQL. This is the production-recommended path, including Turso Cloud
deployments via `createLibsqlClient(...)`.

The LibSQL example wires `UniversalSentenceEncoderEmbeddingService` (USE lite,
512 dimensions). Download offline model artifacts once, then run the example:

```bash
deno task download:tfjs-use
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

The eval harness lives in
[worlds-client-evals](https://github.com/wazootech/worlds-client-evals). It is a
separate repository that consumes `@worlds/client` as a published package and
runs deterministic assertion checks and live model trials against a seeded
in-memory LibSQL world.

To run evals, clone the evals repo and follow its
[README](https://github.com/wazootech/worlds-client-evals#readme):

```bash
git clone https://github.com/wazootech/worlds-client-evals.git
cd worlds-client-evals
deno task evals
```

## Development workflow

All CI checks must pass before merging updates.

| Command          | Description                                  |
| :--------------- | :------------------------------------------- |
| `deno fmt`       | Format all code using native Deno formatter. |
| `deno task lint` | Run strict static analysis checks.           |
| `deno task test` | Execute comprehensive test suites.           |
| `deno task ci`   | Run complete CI pipeline sequentially.       |

## Quicklinks

- [Documentation](https://docs.wazoo.dev)
- [Wazoo Technologies](https://wazoo.dev)
- [Support](https://github.com/wazootech/worlds-client-ts/issues)

Developed with [**@wazootech**](https://github.com/wazootech)
