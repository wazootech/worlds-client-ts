# Changelog

## Unreleased

### Breaking

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

### Migration

```typescript
// Before
const client = new Client(await createLibsqlClientOptions({ client: db }));

// After
const client = new Client(await createLibsqlAdapter({ client: db }));
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
