# Benchmarks

Performance benchmarks for `@worlds/client`. Follow-up work is tracked in GitHub
issues — do not comment on closed perf threads
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
(`createLibsqlClientOptions` from `@worlds/client/adapters/libsql`). See
[discussion #45](https://github.com/wazootech/worlds-client-ts/discussions/45).

## Baseline table (0.0.5, 2026-05-21)

Captured on **Deno 2.7.14 (Windows x86_64)**. CI should pin OS/runtime or use
relaxed tolerances.

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

## Regression policy

- Investigate when a keyed benchmark regresses by **more than ~15%** average vs
  the baseline above (same OS/Deno).
- Open a **new issue** linking
  [#65](https://github.com/wazootech/worlds-client-ts/issues/65) with pasted
  before/after `deno bench` output.

## SPARQL crossover results template

Paste into
[discussion #45](https://github.com/wazootech/worlds-client-ts/discussions/45)
or release notes:

| Quads | Query shape | Backend     | Avg |
| :---- | :---------- | :---------- | :-- |
| 1000  | selective   | hydrate+N3  |     |
| 1000  | selective   | libsqlStore |     |
| 1000  | fullScan    | hydrate+N3  |     |
| 1000  | fullScan    | libsqlStore |     |
| 5000  | selective   | hydrate+N3  |     |
| 5000  | selective   | libsqlStore |     |
| …     | …           | …           |     |
