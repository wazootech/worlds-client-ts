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

- **Explicit JSDoc semantics:** JSDoc comments for all structural symbols
  (functions, interfaces, properties, methods) MUST begin directly with the
  symbol's exact name and form a complete, descriptive sentence.
  - ✅ **Good:**
    `/** SyncLibsqlOptions provides configurations for executing updates against LibSQL durable stores. */`
  - ❌ **Bad:** `/** The underlying database connection. */`
  - ✅ **Corrected:** `/** client is the underlying database connection. */`

- **Unified constructor parameter properties:** For classes with >1 dependency,
  collect all configuration and dependency inputs into a single strongly typed
  `Options` object argument. Store the ENTIRE options object using a single
  TypeScript `private readonly options` parameter property in the constructor.
  - ❌ **Avoid:** Splitting dependencies into multiple positional constructor
    arguments or manually assigning options properties to top-level class fields
    inside the constructor body.
  - ✅ **Prefer:**
    ```typescript
    public constructor(
      private readonly options: LibsqlSearchIndexOptions,
    ) {}
    ```

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

## Documentation aesthetics and markdown conventions

To ensure visual continuity and ease of navigation across all repository
documentation files:

- **Uniform sentence-case headings:** All markdown headings must be clear,
  concise, and exclusively use sentence casing. Do not use decorative emojis in
  any markdown headings.
  - ❌ **Avoid:** `## 🚀 Key Capabilities`, `### ✨ Available Examples`
  - ✅ **Prefer:** `## Key capabilities`, `### Available examples`
- **Non-numbered structural boundaries:** Do not include numeric prefixes in
  markdown headings. Let the physical document outline establish hierarchy
  naturally.
  - ❌ **Avoid:** `### 4. AI SDK agent (Gemini + tools)`
  - ✅ **Prefer:** `### AI SDK agent`
- **Suppression of horizontal rules:** Avoid utilizing `---` divider lines to
  segment documents. Let empty lines establish boundaries cleanly.

## Architectural system map

To maintain absolute alignment and prevent context drift, all development must adhere to the core architectural pillars of the system:

### Ephemeral in-memory execution model
The active Graph Store runtime is anchored on high-speed, transient in-memory RDF processing using `N3.Store` and native `Comunica` execution. This maximizes edge query execution speeds and eliminates recurrent network hop latency during query execution.

### Decoupled store lifecycle via dependency injection
To support high-throughput, serverless container warm-starts, the instantiation and hydration of the Graph Store are fully externalized from the generalized `Client` factory. The caller injects an initialized `Store` directly, allowing trivial container-level caching across sequential HTTP invocations.

### Sterile orchestration via provider adapters
All active instrumentation (proxies, observers, and transactional mutation queues) is isolated strictly inside provider adapters (e.g. `provideLibsql`). The generalized `Client` is kept completely agnostic and sterile, accepting pre-composed adapter options ready for constructor injection.

### Resilient hybrid search with vectorless fallbacks
The system natively supports three search topologies: Hybrid (Fused), Semantic-Only, and Keyword-Only. If upstream embedding services time out or are completely omitted, the system gracefully degrades to high-speed SQLite FTS5 keyword searching without service interruption.

### Stable reciprocal rank fusion relevance blending
To combine vector cosine similarity and Okapi BM25 keyword metrics without fragile hyperparameter calibration, the search query assembler standardizes on Reciprocal Rank Fusion (RRF). Relevance scoring is calculated using discrete rank positions blended with a standard smoothing constant ($k = 60$).

### Deterministic quad-based identity
The system enforces stable, canonical, URL-safe base64 identifiers computed via `hashQuad` for all search results and database synchronizer records. This secures precise, duplicate-free idempotency checks and stable ranking sweeps.
