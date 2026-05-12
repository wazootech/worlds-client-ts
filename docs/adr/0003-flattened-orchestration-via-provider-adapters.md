# ADR 0003: Flattened Orchestration via Provider Adapters

## Status

Accepted

## Context

In the pursuit of a robust generalized API, distributing operational context
across separate high-level orchestration layers generated complex recursive
object footprints and mandated verbose manual wiring.

To fully achieve the vision established in ADR 0002—where operational boundary
and persistence injection are strictly decoupled—we must finalize our
architectural direction by establishing a definitive location for interception
logic.

## Decision

We will collapse generalized orchestration layers and delegate active
instrumentation (proxies, observation hooks, and transaction aggregates)
entirely to provider-specific adapters.

- The generalized `Client` collapses back into a purely agnostic container
  consumed by `ClientOptions`.
- Providers deliver fully composed, pre-instrumented `ClientOptions` objects
  (e.g., `await provideLibsql(...)`) ready for direct constructor injection.
- Synchronization lifecycles (transaction queuing and committing) are
  internalized safely within the closure scope of provider adapters.

## Consequences

- **Positive:** Achieves extreme aesthetic purity in the `Client` container.
- **Positive:** Eliminates complex recursive memory loop risks by isolating
  method hijacking into sterile literal maps.
- **Positive:** Dramatically lowers integration friction for users (standardize
  on `new Client(await provideLibsql(...))`).
- **Negative:** Shifts slightly higher cognitive complexity into the Provider
  factory implementation to manage clean lambda propagation and `this` context
  stability.
