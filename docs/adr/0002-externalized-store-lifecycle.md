# ADR 0002: Externalized Store Lifecycle Management

## Status

Accepted

## Context

In ADR 0001, we established the use of in-memory Graph Stores. In serverless
edge environments, persistent memory exists within warm container instances
across sequential requests. If the Reactive Client factory tightly controls the
instantiation and hydration of this Store, it enforces a mandatory
deserialization CPU tax on every single HTTP invocation.

To optimize for high-throughput edge serving, we need to decoupling the
persistence/warmth of the memory from the operational boundary of the query
engine.

## Decision

We will elevate the ownership of the `Graph Store` completely out of the
generalized client factory.

- `createClient` will now receive an instantiated `Store` as a required
  parameter via Dependency Injection.
- The `hydrate` Hook will be removed from the generalized factory contract.
- Orchestration of instantiation and the logic to gate Hydration (i.e., "is this
  container warm?") rests entirely with the caller.

## Consequences

- **Positive:** Enables trivial container-level caching of the raw store object
  across concurrent/sequential requests.
- **Positive:** Reduces generalized factory complexity by shedding state
  initialization burden.
- **Negative:** Introduces slightly higher boilerplate for manual wiring, which
  we compensate for by offering provider-specific bundled convenience functions
  (e.g., `createLibsqlClient`).
