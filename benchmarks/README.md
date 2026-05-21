# Benchmarks

Performance benchmarks for `@worlds/client`. Follow-up work is tracked in GitHub
issues â€” do not comment on closed perf threads
([#2](https://github.com/wazootech/worlds-client-ts/issues/2),
[#3](https://github.com/wazootech/worlds-client-ts/issues/3),
[#8](https://github.com/wazootech/worlds-client-ts/issues/8),
[#11](https://github.com/wazootech/worlds-client-ts/issues/11)). File a new
issue with before/after output instead.

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

Compares **hydrate+N3** (`createLibsqlN3ClientOptions` from
`@worlds/client/adapters/libsql/n3`) vs **libsqlStore**
(`createLibsqlClientOptions` from `@worlds/client/adapters/libsql`). Canonical
post-preload crossover write-up:
[discussion #69](https://github.com/wazootech/worlds-client-ts/discussions/69).
Earlier context:
[discussion #45](https://github.com/wazootech/worlds-client-ts/discussions/45).

## Measurement notes

Benchmarks preload datasets and SPARQL engines at **module load**; only the hot
path runs inside `benchContext.start()` / `end()`. Write-pressure benches still
create a fresh database per iteration and use `warmup: 5`, `n: 50`.

- **avg** is the primary regression signal; compare like-for-like OS and Deno
  versions only.
- Large **p99** gaps vs **avg** on older runs usually meant per-iteration import
  - GC between timed slices, not multi-second SPARQL alone. After preload,
    crossover p99 should stay within a fewÃ— of avg.
- Optional GC trace (local only, not CI):

  ```bash
  deno bench --allow-all --v8-flags=--trace-gc benchmarks/sparql-hexastore-crossover.bench.ts
  ```

**Production (millions of quads):** prefer
[`createLibsqlClient`](src/client/adapters/libsql/create-libsql-client.ts) for
indexed SPARQL without a full N3 mirror; reuse a warmed
[`store`](src/client/adapters/libsql/n3/create-libsql-n3-client.ts) on the N3
path per container, not per request.

Baselines before preload refactors (2026-05-21 table below) are **not** directly
comparable to post-refactor captures.

## Baseline table (0.0.5, 2026-05-21, pre-preload)

Captured on **Deno 2.7.14 (Windows x86_64)**. CI should pin OS/runtime or use
relaxed tolerances.

### `libsql-pressure.bench.ts`

| Benchmark                                      | Avg                       |
| :--------------------------------------------- | :------------------------ |
| Import 10 / 100 / 1000 quads                   | 4.9 ms / 57.3 ms / 613 ms |
| Hydration 100 / 1k / 5k                        | 3.1 ms / 12.6 ms / 152 ms |
| FTS search (2k corpus) specific / multi / miss | 2.1 ms / 10.0 ms / 1.9 ms |

### `denokv-pressure.bench.ts`

| Benchmark                           | Avg                        |
| :---------------------------------- | :------------------------- |
| Import 10 / 100 / 1000              | 419 Âµs / 1.9 ms / 18.9 ms |
| Hydration 100 / 1k / 5k             | 1.1 ms / 9.0 ms / 49.0 ms  |
| Search hit / miss (full 2k KV scan) | 21.7 ms / 20.8 ms          |

### `search-comparison.bench.ts` (LibSQL FTS vs RDF/JS naive)

| Scale | RDF/JS specific | LibSQL FTS specific |
| :---- | :-------------- | :------------------ |
| 100   | 273 Âµs         | 329 Âµs             |
| 1k    | 3.1 ms          | 327 Âµs             |
| 10k   | 18.3 ms         | 300 Âµs             |

## Baseline table (post-preload, 2026-05-21)

Captured on **Deno 2.7.14 (Windows x86_64)** with module-level preload and
chunked hydration (`DEFAULT_HYDRATION_BATCH_SIZE = 1000`).

### `libsql-pressure.bench.ts`

| Benchmark                                      | Avg                         |
| :--------------------------------------------- | :-------------------------- |
| Import 10 / 100 / 1000 quads                   | 3.2 ms / 46.0 ms / 485 ms   |
| Hydration 100 / 1k / 5k                        | 994 Âµs / 10.0 ms / 46.3 ms |
| FTS search (2k corpus) specific / multi / miss | 726 Âµs / 5.2 ms / 720 Âµs  |

### `denokv-pressure.bench.ts`

| Benchmark                           | Avg                        |
| :---------------------------------- | :------------------------- |
| Import 10 / 100 / 1000              | 278 Âµs / 1.5 ms / 16.7 ms |
| Hydration 100 / 1k / 5k             | 717 Âµs / 7.2 ms / 37.5 ms |
| Search hit / miss (full 2k KV scan) | 16.0 ms / 15.2 ms          |

### `search-comparison.bench.ts` (LibSQL FTS vs RDF/JS naive)

| Scale | RDF/JS specific | LibSQL FTS specific |
| :---- | :-------------- | :------------------ |
| 100   | 150 µs          | 238 µs              |
| 1k    | 2.0 ms          | 198 µs              |
| 10k   | 13.3 ms         | 198 µs              |

### `sparql-hexastore-crossover.bench.ts` (execute only, preloaded)

| Quads | Query shape | Backend     | Avg     |
| :---- | :---------- | :---------- | :------ |
| 1000  | selective   | hydrate+N3  | 511 Âµs |
| 1000  | selective   | libsqlStore | 1.0 ms  |
| 1000  | fullScan    | hydrate+N3  | 3.0 ms  |
| 1000  | fullScan    | libsqlStore | 20.1 ms |
| 5000  | selective   | hydrate+N3  | 362 Âµs |
| 5000  | selective   | libsqlStore | 2.3 ms  |
| 5000  | fullScan    | hydrate+N3  | 4.0 ms  |
| 5000  | fullScan    | libsqlStore | 87.2 ms |
| 10000 | selective   | hydrate+N3  | 274 Âµs |
| 10000 | selective   | libsqlStore | 3.1 ms  |
| 10000 | fullScan    | hydrate+N3  | 5.5 ms  |
| 10000 | fullScan    | libsqlStore | 211 ms  |
| 25000 | selective   | hydrate+N3  | 462 Âµs |
| 25000 | selective   | libsqlStore | 9.5 ms  |
| 25000 | fullScan    | hydrate+N3  | 12.3 ms |
| 25000 | fullScan    | libsqlStore | 509 ms  |
| 50000 | selective   | hydrate+N3  | 357 Âµs |
| 50000 | selective   | libsqlStore | 15.2 ms |
| 50000 | fullScan    | hydrate+N3  | 24.4 ms |
| 50000 | fullScan    | libsqlStore | 1.1 s   |

## Regression policy

Benchmarks are **local only** (no CI gate). Compare against the post-preload
tables above on the same OS and Deno version.

- Investigate when a keyed benchmark regresses by **more than ~15%** average vs
  that baseline.
- Open a **new issue** with pasted before/after `deno bench` output and link
  [discussion #69](https://github.com/wazootech/worlds-client-ts/discussions/69)
  when SPARQL crossover numbers change.

```bash
deno task bench
```

## SPARQL crossover results template

Paste into
[discussion #69](https://github.com/wazootech/worlds-client-ts/discussions/69)
(post-preload) or release notes:

| Quads | Query shape | Backend     | Avg |
| :---- | :---------- | :---------- | :-- |
| 1000  | selective   | hydrate+N3  |     |
| 1000  | selective   | libsqlStore |     |
| 1000  | fullScan    | hydrate+N3  |     |
| 1000  | fullScan    | libsqlStore |     |
| 5000  | selective   | hydrate+N3  |     |
| 5000  | selective   | libsqlStore |     |
| â€¦   | â€¦         | â€¦         |     |
