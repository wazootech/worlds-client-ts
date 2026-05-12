# ADR 0004: Fault-tolerant search and atomic idempotence safeguards

## Status

Accepted

## Context

As the solution approaches production stability, two key systemic fragilities
were surfaced:

1. **State Collision Risk:** Without explicit checks, repeated application
   insertions could propagate redundant triples, inflating database storage
   footprint and spawning financial waste via duplicate vector API requests.
2. **Upstream Starvation:** Relying strictly on Vector Embeddings created a
   hard-failure condition where backend API timeouts rendered the entire Search
   feature useless.

## Decision

We will harden operational resiliency by integrating dual-layer safeguards into
the storage and query assembly vectors.

### Part A: Double-gated idempotency

- **Proxy Layer Validation:** The JavaScript Graph Store proxy executes
  proactive `.has()` state checks before queueing mutations. This suppresses
  financial waste by eliminating redundant external service interactions
  entirely.
- **Atomic Deletion Sweeps:** The SQL provider automatically prepends
  destructive cleanup queries targeting inbound Quad IDs prior to insertion.
  This guarantees ultimate data hygiene in the event of cross-application stale
  footprints.

### Part B: Graceful search degradation

- The query assembler is refactored into an intelligent decision vector handling
  three dynamic topologies: Hybrid (Fused), Semantic (Vector-Only), and Keyword
  (FTS-Only).
- The runtime implementation wraps Vectorization in isolation loops. If an
  upstream provider fails, the system automatically degrades into valid
  high-speed Keyword searches without service interruption.

## Consequences

- **Positive:** Direct cost containment via redundant service call suppression.
- **Positive:** Near-infinite availability for searching capabilities despite
  external downtime.
- **Negative:** Slight rise in implementation complexity inside SQL generators
  and synchronizer transaction layouts.
