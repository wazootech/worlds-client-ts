# Changelog

## Unreleased

### Changed

- LibSQL SPARQL is configured by passing a Comunica `queryEngine` directly into
  adapter options (no `createSparqlEngine` callback or factory helper).
- Deno KV SPARQL reads through a KV-backed RDF/JS store (no per-query N3
  hydration).
- Deno KV `import({ mode: "replace" })` uses an atomic dataset-generation
  pointer instead of prefix-wide deletes; `match()`, `export`, and search scan
  the active generation only.
- Deno KV hexastore `match()` routing is covered by LibSQL-aligned integration
  tests (predicate-, object-, and graph-first patterns).
- Deno KV `replace` garbage-collects orphaned generation keys, adds `idx_sopg`
  (subject+object) index family, and exposes `countQuads` on `DenokvRdfjsStore`
  for Comunica cardinality hints.
- Deno KV hexastore defaults to **seven** quad-native index families (`psog`,
  `opsg` added for full S-P-O-G coverage); re-import or `replace` to backfill
  index keys on existing KV data.

### Breaking

- Removed `@worlds/client/adapters/libsql-n3` (`createLibsqlN3Adapter`) and
  `@worlds/client/quad-store/n3` (`createProxiedN3Store`).
- Removed `createComunicaSparqlEngineFactory` and `createSparqlEngine` adapter
  callbacks; pass `queryEngine` into adapter options instead.

### Migration

```typescript
// Before
import { ComunicaSparqlEngine } from "@worlds/client/adapters/comunica";

createSparqlEngine: ({ store }) =>
  new ComunicaSparqlEngine({ queryEngine, store }),

// After
queryEngine,
```

## 0.0.15

### Breaking

- Removed `@worlds/client/adapters/libsql/n3`. Use
  `@worlds/client/adapters/libsql-n3` (`createLibsqlN3Adapter`).
- Removed `@worlds/client/adapters/rdfjs/n3`. N3 patch capture moved to
  `@worlds/client/quad-store/n3` as `createProxiedN3Store` (formerly
  `proxyStore` on the old path).
- Removed libsql SPARQL query-pattern helper exports; use inline SPARQL strings
  in application code.
- Renamed `ClientOptions` to `Adapter`. The interface describes the composed
  adapter bridging platform-specific infrastructure to the generic `Client`, not
  passive configuration.
- Renamed all adapter factory functions to match:
  - `createRdfjsClientOptions` -> `createRdfjsAdapter`
  - `createLibsqlClientOptions` -> `createLibsqlAdapter`
  - `createLibsqlN3ClientOptions` -> `createLibsqlN3Adapter`
  - `createDenokvClientOptions` -> `createDenokvAdapter`
- Factory source files renamed for file-symbol alignment (e.g.
  `create-libsql-client.ts` -> `create-libsql-adapter.ts`).

### Added

- `mergePatches` on `@worlds/client/quad-store` for concatenating drained N3
  patch batches before persistence.
- `@worlds/client/quad-store/n3` (`createProxiedN3Store`).

### Migration

```typescript
// Before
import { createLibsqlN3Adapter } from "@worlds/client/adapters/libsql/n3";

// After
import { createLibsqlN3Adapter } from "@worlds/client/adapters/libsql-n3";
```

```typescript
// Before
const client = new Client(await createLibsqlClientOptions({ client: db }));

// After
const client = new Client(await createLibsqlAdapter({ client: db }));
```

```typescript
// Before
import { proxyStore } from "@worlds/client/adapters/rdfjs/n3";

// After
import { createProxiedN3Store } from "@worlds/client/quad-store/n3";
import { mergePatches } from "@worlds/client/quad-store";

const { store, drainPatches } = createProxiedN3Store(baseStore);
const patch = mergePatches(drainPatches());
```

## 0.0.14

### Added

- `createComunicaSparqlEngineFactory` and
  `createComunicaLibsqlSparqlEngineFactory` on
  `@worlds/client/adapters/comunica` — preset helpers that return typed
  `createSparqlEngine` callbacks for standard Comunica wiring.

## 0.0.13

### Breaking

- Removed `createLibsqlClient`, `createLibsqlN3Client`, `createRdfjsClient`, and
  `createDenokvClient`. Use `new Client(await createXClientOptions(...))` (or
  `new Client(createXClientOptions(...))` when synchronous).

### Migration

```typescript
// Before
const client = await createLibsqlClient({ client: db });

// After
import { Client } from "@worlds/client";
const client = new Client(await createLibsqlClientOptions({ client: db }));
```

### Examples

- Merged `examples/libsql-hello-world` into
  `examples/libsql-long-running/hexastore.ts`.
- Split LibSQL deployment examples into `libsql-long-running` and
  `libsql-n3-warm-container`, each with `hexastore.ts` and `n3.ts`.
