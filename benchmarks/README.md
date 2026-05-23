# Benchmarks

Performance benchmarks for `@worlds/client`. **Local only** — there is no CI
regression gate; compare results manually on the same OS and Deno version.

| Resource                                                                       | Purpose                                                        |
| :----------------------------------------------------------------------------- | :------------------------------------------------------------- |
| [Discussion #69](https://github.com/wazootech/worlds-client-ts/discussions/69) | Canonical post-preload SPARQL crossover write-up               |
| [Discussion #45](https://github.com/wazootech/worlds-client-ts/discussions/45) | Earlier crossover context (pre-preload methodology)            |
| [#68](https://github.com/wazootech/worlds-client-ts/issues/68)                 | Millions-of-quads production guidance (README + query helpers) |

Do not comment on closed perf threads
([#2](https://github.com/wazootech/worlds-client-ts/issues/2),
[#3](https://github.com/wazootech/worlds-client-ts/issues/3),
[#8](https://github.com/wazootech/worlds-client-ts/issues/8),
[#11](https://github.com/wazootech/worlds-client-ts/issues/11)). File a new
issue with before/after `deno bench` output instead.

**JSR:** [`@worlds/client`](https://jsr.io/@worlds/client) is published on JSR.
Tables below reflect **main** branch methodology (module preload, batched
hydration); they are not a substitute for re-running on your machine.

## Layout

- `*.bench.ts` — runnable benchmarks (`deno bench` discovers these at the repo
  root of `benchmarks/`, not under `shared/`).
- [`shared/`](shared/) — helpers imported by benches (`synthetic-data.ts`,
  `sparql-hexastore-crossover-shared.ts`).

## Run all benchmarks

```bash
deno task bench
```

Or directly:

```bash
deno bench --allow-all --unstable-kv benchmarks/
```

### SPARQL hexastore crossover only

```bash
deno bench --allow-all benchmarks/sparql-hexastore-crossover.bench.ts
```

**Standard (1k–50k):** compares **hydrate+N3** (`createLibsqlN3ClientOptions`
from `@worlds/client/adapters/libsql/n3`) vs **libsqlStore**
(`createLibsqlClientOptions` from `@worlds/client/adapters/libsql`).

**Large (100k–1M):** **libsqlStore only** — the scalable LibSQL path for hybrid
search + SPARQL in production
([#68](https://github.com/wazootech/worlds-client-ts/issues/68)); does not run
hydrate+N3.

Crossover preload uses `searchIndexOnImport: false` (quads only; the timed slice
is `execute()`). Apps that need `search()` at scale use normal import with
inline indexing or `deferSearchIndexOnImport: true`, then `search()`.

### SPARQL crossover at 100k–1M (opt-in, local only)

[#76](https://github.com/wazootech/worlds-client-ts/issues/76). Not part of
`deno task bench` — preload can take a long time and needs ample RAM (16 GB+ for
1M libsqlStore preload).

```bash
deno task bench:crossover-large
```

Or with a larger V8 heap if preload OOMs:

```bash
deno bench --allow-all --v8-flags=--max-old-space-size=8192 benchmarks/sparql-hexastore-crossover-large.bench.ts
```

Module load logs `console.time` lines per scale (`generate`, then each backend).
Only `sparqlEngine.execute()` is timed inside `Deno.bench`. Paste results into
[discussion #69](https://github.com/wazootech/worlds-client-ts/discussions/69).

For full import + search preload timing (not the crossover execute table), use
`deferSearchIndexOnImport: true` on a dedicated bulk-load client (quads first,
search index rebuilt after import).

## Measurement notes

Benchmarks preload datasets and SPARQL engines at **module load**; only the hot
path runs inside `benchContext.start()` / `end()`. Write-pressure benches still
create a fresh database per iteration and use `warmup: 5`, `n: 50`.

- **avg** is the primary signal; compare like-for-like OS and Deno versions
  only.
- Large **p99** gaps vs **avg** on older runs usually meant per-iteration import
  and GC between timed slices, not multi-second SPARQL alone. After preload,
  crossover p99 should stay within a few× of avg.
- Optional GC trace (local only):

  ```bash
  deno bench --allow-all --v8-flags=--trace-gc benchmarks/sparql-hexastore-crossover.bench.ts
  ```

**Production (millions of quads):** prefer
[`createLibsqlClient`](../src/client/adapters/libsql/create-libsql-client.ts)
for indexed SPARQL without a full N3 mirror; reuse a warmed
[`store`](../src/client/adapters/libsql/n3/create-libsql-n3-client.ts) on the N3
path per container, not per request. Track guidance in
[#68](https://github.com/wazootech/worlds-client-ts/issues/68).

Baselines in the **pre-preload** table (below) are **not** directly comparable
to **post-preload** captures.

## Baseline table (2026-05-21, pre-preload)

Captured on **Deno 2.7.14 (Windows x86_64)** before module-level preload.
Historical reference only.

### `libsql-pressure.bench.ts`

| Benchmark                                      | Avg                       |
| :--------------------------------------------- | :------------------------ |
| Import 10 / 100 / 1000 quads                   | 4.9 ms / 57.3 ms / 613 ms |
| Hydration 100 / 1k / 5k                        | 3.1 ms / 12.6 ms / 152 ms |
| FTS search (2k corpus) specific / multi / miss | 2.1 ms / 10.0 ms / 1.9 ms |

### `denokv-pressure.bench.ts`

| Benchmark                           | Avg                       |
| :---------------------------------- | :------------------------ |
| Import 10 / 100 / 1000              | 419 µs / 1.9 ms / 18.9 ms |
| Hydration 100 / 1k / 5k             | 1.1 ms / 9.0 ms / 49.0 ms |
| Search hit / miss (full 2k KV scan) | 21.7 ms / 20.8 ms         |

### `search-comparison.bench.ts` (LibSQL FTS vs RDF/JS naive)

| Scale | RDF/JS specific | LibSQL FTS specific |
| :---- | :-------------- | :------------------ |
| 100   | 273 µs          | 329 µs              |
| 1k    | 3.1 ms          | 327 µs              |
| 10k   | 18.3 ms         | 300 µs              |

## Baseline table (post-preload, 2026-05-22)

Captured on **Deno 2.8.0 (Windows x86_64)** with module-level preload and
batched LibSQL hydration (`DEFAULT_HYDRATION_BATCH_SIZE = 1000`). Use this table
for local regression checks.

### `libsql-pressure.bench.ts`

| Benchmark                                      | Avg                        |
| :--------------------------------------------- | :------------------------- |
| Import 10 / 100 / 1000 quads                   | 4.3 ms / 60.5 ms / 615 ms  |
| Hydration 100 / 1k / 5k                        | 1.4 ms / 14.1 ms / 73.0 ms |
| FTS search (2k corpus) specific / multi / miss | 997 µs / 7.3 ms / 948 µs   |

### `denokv-pressure.bench.ts`

| Benchmark                           | Avg                        |
| :---------------------------------- | :------------------------- |
| Import 10 / 100 / 1000              | 734 µs / 3.3 ms / 24.7 ms  |
| Hydration 100 / 1k / 5k             | 1.4 ms / 11.9 ms / 58.1 ms |
| Search hit / miss (full 2k KV scan) | 24.0 ms / 25.8 ms          |

### `search-comparison.bench.ts` (LibSQL FTS vs RDF/JS naive)

| Scale | RDF/JS specific | LibSQL FTS specific |
| :---- | :-------------- | :------------------ |
| 100   | 151 µs          | 199 µs              |
| 1k    | 2.0 ms          | 287 µs              |
| 10k   | 13.0 ms         | 182 µs              |

### `sparql-hexastore-crossover.bench.ts` (execute only, preloaded)

| Quads | Query shape | Backend     | Avg     |
| :---- | :---------- | :---------- | :------ |
| 1000  | selective   | hydrate+N3  | 1.4 ms  |
| 1000  | selective   | libsqlStore | 2.5 ms  |
| 1000  | fullScan    | hydrate+N3  | 5.3 ms  |
| 1000  | fullScan    | libsqlStore | 27.5 ms |
| 5000  | selective   | hydrate+N3  | 806 µs  |
| 5000  | selective   | libsqlStore | 4.5 ms  |
| 5000  | fullScan    | hydrate+N3  | 7.8 ms  |
| 5000  | fullScan    | libsqlStore | 50.1 ms |
| 10000 | selective   | hydrate+N3  | 683 µs  |
| 10000 | selective   | libsqlStore | 7.5 ms  |
| 10000 | fullScan    | hydrate+N3  | 11.9 ms |
| 10000 | fullScan    | libsqlStore | 68.1 ms |
| 25000 | selective   | hydrate+N3  | 671 µs  |
| 25000 | selective   | libsqlStore | 19.1 ms |
| 25000 | fullScan    | hydrate+N3  | 23.6 ms |
| 25000 | fullScan    | libsqlStore | 123 ms  |
| 50000 | selective   | hydrate+N3  | 638 µs  |
| 50000 | selective   | libsqlStore | 39.4 ms |
| 50000 | fullScan    | hydrate+N3  | 44.3 ms |
| 50000 | fullScan    | libsqlStore | 215 ms  |

### `sparql-hexastore-crossover-large.bench.ts` (execute only, preloaded)

Captured on **Deno 2.8.0 (Windows x86_64)** via
`deno task bench:crossover-large` (`--v8-flags=--max-old-space-size=8192`).
**libsqlStore only**, `searchIndexOnImport: false` (quads-only preload; no
hydrate+N3, no FTS/chunk build during import).

Module preload (`console.time`, not in `Deno.bench`): 100k ~20 s; 250k ~63 s;
500k ~130 s; 1M ~279 s (single libsqlStore fixture per scale).

| Quads   | Query shape | Backend     | Avg     |
| :------ | :---------- | :---------- | :------ |
| 100000  | selective   | libsqlStore | 38.2 ms |
| 100000  | fullScan    | libsqlStore | 232 ms  |
| 250000  | selective   | libsqlStore | 101 ms  |
| 250000  | fullScan    | libsqlStore | 539 ms  |
| 500000  | selective   | libsqlStore | 179 ms  |
| 500000  | fullScan    | libsqlStore | 1.1 s   |
| 1000000 | selective   | libsqlStore | 373 ms  |
| 1000000 | fullScan    | libsqlStore | 2.2 s   |

Earlier captures (2026-05-22) included hydrate+N3 and inline search indexing;
preload ~33–39 s/backend at 100k through ~466–509 s/backend at 1M — not
comparable to the row above.

## Regression policy

- Investigate when a keyed benchmark regresses by **more than ~15%** average vs
  the post-preload table on the same OS and Deno version.
- Open a **new issue** with pasted before/after `deno bench` output.
- Link
  [discussion #69](https://github.com/wazootech/worlds-client-ts/discussions/69)
  when SPARQL crossover numbers change.

```bash
deno task bench
```

## SPARQL crossover results template

Paste into
[discussion #69](https://github.com/wazootech/worlds-client-ts/discussions/69)
or release notes:

| Quads   | Query shape | Backend     | Avg |
| :------ | :---------- | :---------- | :-- |
| 1000    | selective   | hydrate+N3  |     |
| 1000    | selective   | libsqlStore |     |
| 1000    | fullScan    | hydrate+N3  |     |
| 1000    | fullScan    | libsqlStore |     |
| 5000    | selective   | hydrate+N3  |     |
| 5000    | selective   | libsqlStore |     |
| …       | …           | …           |     |
| 100000  | selective   | libsqlStore |     |
| 1000000 | selective   | libsqlStore |     |
| …       | …           | …           |     |
