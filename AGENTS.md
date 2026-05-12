# AI Agent Coding Guidelines

This document serves as the authoritative behavioral and stylistic manual for
all AI Agents writing code in this repository.

## 1. Declarative Clarity & Naming Conventions

To preserve maximum maintenance legibility, prioritize expressive semantics over
mathematical brevity.

- **Zero Cryptic Abbreviations:** Never utilize ambiguous or single-syllable
  variable shorthand. Always expand abstractions into their descriptive
  counterparts.
  - ❌ **Avoid:** `rs`, `res`, `req`, `cnt`, `q`, `err`
  - ✅ **Prefer:** `resultSet`, `response`, `request`, `count`, `quad`, `error`

- **Deterministic Prefixes:** Use active verb modifiers when establishing
  asynchronous action boundaries (e.g., `fetchData`, `persistState`).

## 2. State Resilience & Dual-Layer Safety

When interacting with replication synchronizers or persistent storage
interfaces:

- **Performant Optimizations FIRST:** Proactively evaluate in-memory state (e.g.
  `.has()` lookups) to suppress redundant downstream calls to external APIs
  (such as LLM embedding services).
- **Idempotent Integrity SECOND:** Implement pre-emptive destructive wipes or
  atomic conflict resolutions at the SQL level to prevent dirty persistent state
  footprints across reboots.

## 3. Graceful Feature Degradation

All foundational interface architectures interacting with network services MUST
implement localized fallback handlers:

- Defensively isolate third-party API requests (e.g., vectorization,
  translation).
- Automatically fallback to native local logic pathways (such as pure
  keyword-only FTS) to sustain primary capability availability during dependency
  outages.
