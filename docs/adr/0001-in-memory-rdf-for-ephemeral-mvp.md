# ADR 0001: In-Memory RDF Evaluation for MVP Deployment

## Status

Accepted

## Context

The system intends to deliver declarative graph querying and fuzzy semantic
searching in a combined JS-native runtime. While target scale eventually demands
specialized, off-loaded storage systems like Neptune or Fuseki, high early
development velocity and robust local testability require a monolithic runtime
strategy.

Furthermore, targeting serverless edge environments implies highly ephemeral
execution lifecycles where external round-trips should be minimized.

## Decision

For the immediate system lifecycle (MVP and Proof of Concept), we will anchor on
in-memory RDF storage (`N3.Store`) and native processing (`Comunica`).

- Ephemeral environments will utilize "Request-Scoped Hydration" strategies.
- Scaling boundaries are defined at < 50,000 quads per instance.
- Mutation consistency is fulfilled by transparent intercept bridges that sync
  transient memory updates down to stable relational storage (e.g., LibSQL).

## Consequences

- **Positive:** Fully unified local test execution with zero external infra
  mocks required.
- **Positive:** Sub-millisecond local SPARQL lookups once memory is warmed.
- **Negative:** Cold-starts encounter serialization CPU time correlated to total
  stored fact density.
- **Negative:** Physical host RAM constitutes the final bounds of total
  queryable datasets.
