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
> **JSR:** [`@worlds/client`](https://jsr.io/@worlds/client) includes batched
> LibSQL hydration, post-preload benchmark methodology, and scale SPARQL
> query-shape helpers.
>
> **Production:** use Turso Cloud through `createLibsqlClientOptions` + `Client`
> for scale. Prefer hexastore SPARQL on LibSQL without mirroring the full graph
> into N3. The RDFJS-backed and Deno Kv-backed search/index paths, including
> topologies built around `RdfjsSearchIndex` and `DenokvSearchIndex`, are best
> suited to local development, tests, and constrained single-process demos. They
> are not the recommended production topology.

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

[→ Benchmarks](benchmarks/README.md)

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

Adapters wire three subsystems (`quadStore`, `sparqlEngine`, `searchIndex`) into
`ClientOptions`. The `Client` class is a thin facade over that bag.

For production-scale deployments, prefer LibSQL-compatible infrastructure such
as Turso Cloud through `createLibsqlClientOptions` + `Client`.

```typescript
import { Client } from "@worlds/client";
import { ComunicaSparqlEngine } from "@worlds/client/adapters/comunica";
import { createLibsqlClientOptions } from "@worlds/client/adapters/libsql";
import { createRdfjsClientOptions } from "@worlds/client/adapters/rdfjs";
import { createDenokvClientOptions } from "@worlds/client/adapters/denokv";
import { createClient } from "@libsql/client";
import { QueryEngine } from "@comunica/query-sparql-rdfjs-lite";

// 1. In-memory / transient graph (default)
const inMemoryClient = new Client(createRdfjsClientOptions());

// 2. Local SQLite or Turso via LibSQL (recommended for production)
const db = createClient({ url: "file:./worlds.db" });
const queryEngine = new QueryEngine();
const libsqlClient = new Client(
  await createLibsqlClientOptions({
    client: db,
    createSparqlEngine: ({ libsqlStore }) =>
      new ComunicaSparqlEngine({ queryEngine, store: libsqlStore }),
  }),
);

// 3. Deno Kv (prototyping / constrained edge — not primary production path)
const kv = await Deno.openKv();
const kvClient = new Client(createDenokvClientOptions({ kv }));
```

Cache `ClientOptions` (or a `Client`) in module scope when reusing wiring across
requests — see **Runtime patterns** below.

### Runtime patterns

| Deployment                       | Examples                        | What to reuse across requests                                                 |
| :------------------------------- | :------------------------------ | :---------------------------------------------------------------------------- |
| Serverless / edge (warm isolate) | Deno Deploy, Vercel Edge        | `ClientOptions` or `Client` built **once per isolate** — not per HTTP request |
| Long-running service             | Fly.io, DigitalOcean, 24/7 Deno | One `Client` at **process boot**                                              |

Runnable matrices:

- Long-running: [`examples/libsql-long-running`](examples/libsql-long-running)
  (`hexastore.ts`, `n3.ts`)
- Warm isolate:
  [`examples/libsql-n3-warm-container`](examples/libsql-n3-warm-container)
  (`hexastore.ts`, `n3.ts`)

Do not call `createLibsqlN3ClientOptions` on every HTTP request when reusing a
warmed N3 `store` — that rebuilds proxies, search index, and patch sync each
time.

#### Discovery search and SPARQL reasoning

Use **search** to discover subject IRIs from natural-language queries, then run
**SPARQL** on those IRIs to disambiguate and reason over facts. The AI SDK hello
world example follows this two-hop pattern.

**Agent prompt contract** (aligned with
[worlds-client-evals](https://github.com/wazootech/worlds-client-evals) tools
and system prompt):

- Call **search** first with an exact label or keyword; use **`subject`** (and
  **`predicate`** when helpful) from results — not **`text`** alone — for
  SPARQL.
- **`SearchResult.text`** is the object literal; discovery tokens live in the
  FTS index only.
- Call **SPARQL** for traversal; use `SELECT ?p ?o WHERE { <uri> ?p ?o }` to
  inspect a resource before targeted queries.
- Final answers use **exact literals from SPARQL bindings**; say “not found”
  instead of guessing.
- Stop tooling once the requested literal appears in bindings.

Canonical strings live in
[`examples/ai-sdk-hello-world/agent-prompts.ts`](examples/ai-sdk-hello-world/agent-prompts.ts)
and
[`examples/ai-sdk-hello-world/tools/agent-tool-descriptions.ts`](examples/ai-sdk-hello-world/tools/agent-tool-descriptions.ts).

LibSQL indexes split literal ground truth from discovery text:

- `chunks.value` — object literal returned as `SearchResult.text`
- `chunks.fts_value` — subject local name, predicate phrase, literal, and label
  aliases for FTS/vectors

Configure extra label predicates (union with built-in `rdfs:label`,
`skos:prefLabel`, `schema:name`):

```typescript
const client = new Client(
  await createLibsqlClientOptions({
    client: db,
    labelPredicates: ["http://example.org/customLabel"],
  }),
);
```

After a schema upgrade or bulk ontology import, rebuild all search chunks from
durable `quads`:

```typescript
await client.rebuildSearchIndex({
  quadFilter: { include: { graphs: ["http://example.org/ontology"] } },
});
```

Advanced: `rebuildLibsqlSearchIndexFromQuads` in
`@worlds/client/adapters/libsql` remains available when you do not have a
`Client` instance.

After renaming an entity, refresh every chunk for affected subjects:

```typescript
import { refreshSearchChunksForSubjects } from "@worlds/client/adapters/libsql";

await refreshSearchChunksForSubjects(["http://example.org/Aurelia"], {
  client: db,
  textSplitter,
  libsqlQueryBuilder,
  embeddingService,
});
```

Label predicate commits fan out automatically; sibling fact rows pick up new
alias tokens in `fts_value`.

### Choosing a LibSQL topology

Both options builders provision hexastore indexes at schema init. Pick by how
much graph you mirror in memory and how you run SPARQL.

| Options builder               | Module                              | When to use                                                                                                                  |
| :---------------------------- | :---------------------------------- | :--------------------------------------------------------------------------------------------------------------------------- |
| `createLibsqlClientOptions`   | `@worlds/client/adapters/libsql`    | **Production and large graphs.** SPARQL runs on `LibsqlStore` (hexastore). No full N3 hydration per request.                 |
| `createLibsqlN3ClientOptions` | `@worlds/client/adapters/libsql/n3` | **Selective workloads** where hydrating into N3 is acceptable. Reuse one warmed `store` per container, not per HTTP request. |

Post-preload benchmarks (1k–50k quads) show **hydrate+N3** can win **selective**
queries when the graph is already in memory; **libsqlStore** avoids full
hydration cost and is the better default as graphs grow. Avoid unbound
full-graph scans at production scale.

- Canonical crossover write-up:
  [discussion #69](https://github.com/wazootech/worlds-client-ts/discussions/69)
- Local numbers and methodology: [`benchmarks/README.md`](benchmarks/README.md)
- Scale roadmap (millions of quads):
  [#68](https://github.com/wazootech/worlds-client-ts/issues/68)

```typescript
import { createLibsqlClientOptions } from "@worlds/client/adapters/libsql";
import { createLibsqlN3ClientOptions } from "@worlds/client/adapters/libsql/n3";
```

### Scale and SPARQL query shape

At millions of quads, pick the topology at integration time — there is no
runtime SPARQL router
([#63](https://github.com/wazootech/worlds-client-ts/issues/63)).

| Concern         | Production default                                                                                                                                                                                                      |
| :-------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LibSQL topology | `createLibsqlClientOptions` — hexastore `LibsqlStore`, no full N3 mirror per request                                                                                                                                    |
| Hot-path SPARQL | Bind at least one term (subject, predicate, or object). Subject-bound property lookups match crossover **selective** shapes and stay index-friendly                                                                     |
| Avoid at scale  | Unbound `?s ?p ?o` (even with `LIMIT`) on `libsqlStore` — crossover **fullScan** degrades to hundreds of ms–seconds as quads grow ([#69](https://github.com/wazootech/worlds-client-ts/discussions/69))                 |
| N3 + Comunica   | `createLibsqlN3ClientOptions` only when you need in-memory N3; pass a warmed `store` hydrated **once per container**, not per HTTP request                                                                              |
| Local crossover | `deno task bench` → `sparql-hexastore-crossover.bench.ts`; 100k–1M opt-in: `deno task bench:crossover-large` — see [`benchmarks/README.md`](benchmarks/README.md)                                                       |
| Bulk import     | `deferSearchIndexOnImport: true` persists quads on import, then rebuilds search index after each import; `searchIndexOnImport: false` skips indexing until `await client.rebuildSearchIndex()` (SPARQL-only bulk loads) |
| Cardinality     | `LibsqlStore.countQuads` is used by Comunica when hexastore SPARQL is wired (no extra adapter config)                                                                                                                   |

Query helpers (same shapes as benchmarks):

```typescript
import {
  createCappedUnboundTriplePatternSparqlQuery,
  createSubjectBoundPropertiesSparqlQuery,
} from "@worlds/client/adapters/libsql";

const selectiveQuery = createSubjectBoundPropertiesSparqlQuery("urn:entity:0");
// SELECT ?property ?object WHERE { <urn:entity:0> ?property ?object }

const devScanQuery = createCappedUnboundTriplePatternSparqlQuery(100);
// SELECT ?subject ?property ?object WHERE { ?subject ?property ?object } LIMIT 100
```

Runnable walkthrough: `deno task example:libsql-sparql-scale`
([`examples/libsql-sparql-scale`](examples/libsql-sparql-scale)).

**JSR:** [`@worlds/client`](https://jsr.io/@worlds/client) ships batched LibSQL
hydration (`DEFAULT_HYDRATION_BATCH_SIZE = 1000`), SPARQL query-shape helpers,
and production scale guidance
([#68](https://github.com/wazootech/worlds-client-ts/issues/68)). Warm N3
containers: `deno task example:libsql-n3-warm-container:n3`.

## Build with Worlds SDK

Include Worlds as your semantic context layer.

### Install

```bash
deno add jsr:@worlds/client
```

### Quickstart

```typescript
import { Client } from "@worlds/client";
import { createRdfjsClientOptions } from "@worlds/client/adapters/rdfjs";

const client = new Client(createRdfjsClientOptions());

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

### LibSQL long-running (Fly.io / DigitalOcean)

Hexastore (production default) and N3 hydrate paths for 24/7 processes.

```bash
deno task download:tfjs-use   # hexastore example only
deno task example:libsql-long-running:hexastore
deno task example:libsql-long-running:n3
```

See [`examples/libsql-long-running`](examples/libsql-long-running).

### LibSQL SPARQL at scale

Subject-bound vs capped-scan query shapes for large graphs
([#68](https://github.com/wazootech/worlds-client-ts/issues/68)).

```bash
deno task example:libsql-sparql-scale
```

### LibSQL warm container (serverless / edge)

Reuse wiring once per warm isolate — not per HTTP request
([#68](https://github.com/wazootech/worlds-client-ts/issues/68)).

```bash
deno task example:libsql-n3-warm-container:hexastore
deno task example:libsql-n3-warm-container:n3
```

`example:libsql-n3-warm-container` aliases the N3 entry. See
[`examples/libsql-n3-warm-container`](examples/libsql-n3-warm-container).

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

All CI checks must pass before merging updates. Performance benchmarks are
**local only** (no CI regression gate); see
[`benchmarks/README.md`](benchmarks/README.md).

| Command           | Description                                  |
| :---------------- | :------------------------------------------- |
| `deno fmt`        | Format all code using native Deno formatter. |
| `deno task lint`  | Run strict static analysis checks.           |
| `deno task test`  | Execute comprehensive test suites.           |
| `deno task bench` | Run performance benchmarks locally.          |
| `deno task ci`    | Run complete CI pipeline sequentially.       |

## Quicklinks

- [Documentation](https://docs.wazoo.dev)
- [Wazoo Technologies](https://wazoo.dev)
- [Support](https://github.com/wazootech/worlds-client-ts/issues)

Developed with [**@wazootech**](https://github.com/wazootech)
