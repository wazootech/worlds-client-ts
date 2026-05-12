# AI agent coding guidelines

This document serves as the authoritative behavioral and stylistic manual for
all AI Agents writing code in this repository.

## Declarative clarity and naming conventions

To preserve maximum maintenance legibility, prioritize expressive semantics over
mathematical brevity.

- **Zero cryptic abbreviations:** Never utilize ambiguous or single-syllable
  variable shorthand. Always expand abstractions into their descriptive
  counterparts.
  - ❌ **Avoid:** `rs`, `res`, `req`, `cnt`, `q`, `err`
  - ✅ **Prefer:** `resultSet`, `response`, `request`, `count`, `quad`, `error`
  - **Conflict avoidance:** Evade naming collisions via intuitive descriptive
    prefixes or suffixes (e.g., `storedCount`, `processedQuad`).

- **Direct file-symbol alignment:** The name of source files must strictly match
  the dominant exported symbol using lowercase kebab-case identifiers.
  - Example: `LibsqlSearchIndex` MUST live in `libsql-search-index.ts`.

- **Deterministic prefixes:** Use active verb modifiers when establishing
  asynchronous action boundaries (e.g., `fetchData`, `persistState`).

## State resilience and dual-layer safety

When interacting with replication synchronizers or persistent storage
interfaces:

- **Performant optimizations FIRST:** Proactively evaluate in-memory state (e.g.
  `.has()` lookups) to suppress redundant downstream calls to external APIs
  (such as LLM embedding services).
- **Idempotent integrity SECOND:** Implement pre-emptive destructive wipes or
  atomic conflict resolutions at the SQL level to prevent dirty persistent state
  footprints across reboots.

## Graceful feature degradation

All foundational interface architectures interacting with network services MUST
implement localized fallback handlers:

- Defensively isolate third-party API requests (e.g., vectorization,
  translation).
- Automatically fallback to native local logic pathways (such as pure
  keyword-only FTS) to sustain primary capability availability during dependency
  outages.
