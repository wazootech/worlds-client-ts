<p align="center">
  <a href="https://docs.wazoo.dev">
    <img src="https://wazoo.dev/assets/wazoo.svg" alt="Wazoo Worlds" width="400" />
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

Worlds is the infrastructure layer for persistent, edge-native knowledge.
The engine implements a edge-native semantic knowledge graph backed by transactional
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

Maintenance-free serverless storage.

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

```typescript
import { Client } from "@worlds/client";
import { provideLibsql } from "@worlds/client/providers/libsql";
import { provideDenoKv } from "@worlds/client/providers/denokv";
import { createClient } from "@libsql/client";

// 1. In-Memory / Transient Graph (Default)
const client = new Client();

// 2. Local SQLite Persistence via LibSQL
const db = createClient({ url: "file:./worlds.db" });
const sqliteClient = new Client(await provideLibsql({ client: db }));

// 3. Stateless Edge Deployment via Deno Kv
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

```bash
deno task example:libsql-hello-world
```

### Stateless Deno Kv

Per-operation lazy hydration running in zero-maintenance edge contexts.

```bash
deno task example:denokv-hello-world
```

### AI SDK integration (Gemini + tools)

Wrap the Client as Vercel AI SDK tools for autonomous LLM reasoning.

```bash
deno task example:ai-sdk-hello-world
```

## Development workflow

All CI checks must pass before merging updates.

| Command          | Description                                  |
| :--------------- | :------------------------------------------- |
| `deno fmt`       | Format all code using native Deno formatter. |
| `deno task lint` | Run strict static analysis checks.           |
| `deno task test` | Execute comprehensive test suites.           |
| `deno task ci`   | Run complete CI pipeline sequentially.       |

## Prior research

The following research inspires this work:

- [Thinking with Knowledge Graphs (Arxiv)](https://arxiv.org/abs/2412.10654)
- [World Models (Ha & Schmidhuber)](https://worldmodels.github.io/)
- [MemGPT: Towards LLMs as Operating Systems (Arxiv)](https://arxiv.org/abs/2310.08560)

## Quicklinks

- [Documentation](https://docs.wazoo.dev)
- [Academy](https://docs.wazoo.dev/academy)
- [Performance Issue #11](https://github.com/wazootech/worlds-client-ts/issues/11)
- [Wazoo Technologies](https://wazoo.dev)
- [Support](https://github.com/wazootech/worlds-client-ts/issues)

Developed with [**@wazootech**](https://github.com/wazootech)
