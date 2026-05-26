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

Worlds is the infrastructure layer for persistent, edge-native knowledge graphs.
The TypeScript SDK provides transactional graph storage, hybrid search, and
declarative SPARQL querying for agents and applications.

- **Store**: Persist RDF knowledge graphs on SQLite, Turso, or Deno KV.
- **Search**: Hybrid retrieval combining keyword FTS5 and vector embeddings.
- **Query**: Built-in SPARQL engine for declarative graph traversal and
  reasoning.
- **Sync**: Transactional mutation queue with dual-layer persistence.

## Install

```bash
deno add jsr:@worlds/client
```

## Quickstart

```typescript
import { Client } from "@worlds/client";
import { createComunicaSparqlEngineFactory } from "@worlds/client/adapters/comunica";
import { createRdfjsAdapter } from "@worlds/client/adapters/rdfjs";
import { QueryEngine } from "@comunica/query-sparql-rdfjs-lite";

const client = new Client(
  createRdfjsAdapter({
    createSparqlEngine: createComunicaSparqlEngineFactory({
      queryEngine: new QueryEngine(),
    }),
  }),
);

await client.import({
  source: {
    kind: "serialized",
    contentType: "text/turtle",
    data: `@prefix ex: <http://example.org/> .
      ex:Alice ex:bio "Alice explores the depths." ;
               ex:location "Underdark" .`,
  },
});

const searchResults = await client.search({ query: "explores" });
const subject = searchResults.results[0].subject;

const sparqlResponse = await client.sparql({
  query: `SELECT ?property ?object WHERE { <${subject}> ?property ?object }`,
});
console.log(sparqlResponse);
```

> [!TIP]
> For production, use the LibSQL adapter with Turso Cloud. See
> [Adapters](#adapters) below.

## Core concepts

**Quad store**: Manages RDF triples (subject, predicate, object, graph) with
transactional import and export.

**Search index**: Hybrid retrieval over graph literals, combining keyword FTS5
with vector similarity via an embedding service and quad chunker.

**SPARQL engine**: Evaluates declarative queries and updates against the graph
for structured traversal and reasoning.

## Adapters

| Adapter | Best for                      | Persistence          | SPARQL                           |
| :------ | :---------------------------- | :------------------- | :------------------------------- |
| RDFJS   | Dev, tests, demos             | None (in-memory)     | Via Comunica over N3 store       |
| LibSQL  | Production, scale             | SQLite / Turso Cloud | Hexastore indexes on LibsqlStore |
| Deno KV | Prototyping, constrained edge | Deno KV store        | Per-query hydration into N3      |

### RDFJS (in-memory)

```typescript
import { Client } from "@worlds/client";
import { createComunicaSparqlEngineFactory } from "@worlds/client/adapters/comunica";
import { createRdfjsAdapter } from "@worlds/client/adapters/rdfjs";
import { QueryEngine } from "@comunica/query-sparql-rdfjs-lite";

const client = new Client(
  createRdfjsAdapter({
    createSparqlEngine: createComunicaSparqlEngineFactory({
      queryEngine: new QueryEngine(),
    }),
  }),
);
```

### LibSQL (production)

```typescript
import { Client } from "@worlds/client";
import { createComunicaLibsqlSparqlEngineFactory } from "@worlds/client/adapters/comunica";
import { createLibsqlAdapter } from "@worlds/client/adapters/libsql";
import { createClient } from "@libsql/client";
import { QueryEngine } from "@comunica/query-sparql-rdfjs-lite";

const db = createClient({ url: "file:./worlds.db" });
const client = new Client(
  await createLibsqlAdapter({
    client: db,
    createSparqlEngine: createComunicaLibsqlSparqlEngineFactory({
      queryEngine: new QueryEngine(),
    }),
  }),
);
```

### Deno KV (prototyping)

```typescript
import { Client } from "@worlds/client";
import { createComunicaSparqlEngineFactory } from "@worlds/client/adapters/comunica";
import { createDenokvAdapter } from "@worlds/client/adapters/denokv";
import { QueryEngine } from "@comunica/query-sparql-rdfjs-lite";

const kv = await Deno.openKv();
const client = new Client(
  createDenokvAdapter({
    kv,
    createSparqlEngine: createComunicaSparqlEngineFactory({
      queryEngine: new QueryEngine(),
    }),
  }),
);
```

## Examples

| Example                                                       | Description                                    | Command                                                |
| :------------------------------------------------------------ | :--------------------------------------------- | :----------------------------------------------------- |
| [Hello world](examples/hello-world)                           | In-memory graph with search                    | `deno task example:hello-world`                        |
| [LibSQL hexastore](examples/libsql-long-running)              | Production hexastore for long-running services | `deno task example:libsql-long-running:hexastore`      |
| [LibSQL N3](examples/libsql-long-running)                     | Hydrate-once N3 path for long-running services | `deno task example:libsql-long-running:n3`             |
| [LibSQL SPARQL scale](examples/libsql-sparql-scale)           | Subject-bound vs capped-scan query shapes      | `deno task example:libsql-sparql-scale`                |
| [Warm container hexastore](examples/libsql-n3-warm-container) | Reuse client per warm isolate                  | `deno task example:libsql-n3-warm-container:hexastore` |
| [Warm container N3](examples/libsql-n3-warm-container)        | Reuse hydrated store per warm isolate          | `deno task example:libsql-n3-warm-container:n3`        |
| [Deno KV](examples/denokv-hello-world)                        | Stateless per-operation hydration              | `deno task example:denokv-hello-world`                 |
| [AI SDK](examples/ai-sdk-hello-world)                         | Vercel AI SDK tools with Gemini                | `deno task example:ai-sdk-hello-world`                 |

The [agent eval harness](https://github.com/wazootech/worlds-client-evals) lives
in a separate repository and runs deterministic assertion checks against a
seeded LibSQL world.

## Advanced

**Choosing a LibSQL topology**: hexastore vs N3 hydration, warm containers,
SPARQL query shape at scale, and bulk import strategies.
[-> AGENTS.md](AGENTS.md)

**Agent integration**: search-then-SPARQL two-hop pattern for LLM tool use with
hybrid retrieval. [-> AGENTS.md](AGENTS.md)

**Benchmarks**: local-only performance captures, crossover methodology, and
regression policy. [-> benchmarks/README.md](benchmarks/README.md)

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
