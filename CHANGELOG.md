# Changelog

## Unreleased

## 0.0.16

### Breaking

- Removed exported `Adapter` interface. `Client` is the sole public runtime
  type; factories return `Client` directly.
- Restored `createLibsqlClient`, `createLibsqlN3Client`, `createRdfjsClient`,
  and `createDenokvClient` as canonical factory names. `createXAdapter` remains
  as a deprecated alias (removed in 0.0.17).
- Renamed `SparqlEngineInterface.execute` to `sparql` (aligns with
  `ClientInterface.sparql`).
- Removed `createSparqlEngine` from `createLibsqlClient` and
  `createLibsqlN3Client`. Use `createLibsqlComunicaClient` from
  `@worlds/client/adapters/libsql/comunica` (hexastore) or
  `createLibsqlN3ComunicaClient` from
  `@worlds/client/adapters/libsql-n3/comunica` (hydrated N3); pass a warmed
  `store` on the N3 path to control hydration timing.

### Migration

```typescript
// Before (0.0.15)
import { Client } from "@worlds/client";
import { createLibsqlAdapter } from "@worlds/client/adapters/libsql";

const client = new Client(
  await createLibsqlAdapter({ client: db }),
);

// After (0.0.16)
import { createLibsqlClient } from "@worlds/client/adapters/libsql";

const client = await createLibsqlClient({ client: db });
```

Advanced composition (tests, custom stores):

```typescript
import { Client } from "@worlds/client";

const client = new Client(quadStore, searchIndex, sparqlEngine);
```

LibSQL hexastore + Comunica:

```typescript
// Before
await createLibsqlClient({
  client: db,
  createSparqlEngine: createComunicaLibsqlSparqlEngineFactory({ queryEngine }),
});

// After
import { createLibsqlComunicaClient } from "@worlds/client/adapters/libsql/comunica";

await createLibsqlComunicaClient({ client: db, queryEngine });
```

LibSQL N3 + Comunica:

```typescript
// Before
await createLibsqlN3Client({
  client: db,
  createSparqlEngine: createComunicaSparqlEngineFactory({ queryEngine }),
});

// After
import { createLibsqlN3ComunicaClient } from "@worlds/client/adapters/libsql-n3/comunica";

await createLibsqlN3ComunicaClient({ client: db, queryEngine });
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
