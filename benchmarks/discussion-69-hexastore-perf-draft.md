# SPARQL hexastore performance (libsql vs denokv) — selective only

Captured **2026-05-27** on **Windows x86_64**, **Deno 2.8.0**. Standard scales
1k–50k. Synthetic corpus `SYNTHETIC_CORPUS_VERSION = 1`.

## Methodology

- **Preload** (untimed): `console.time` at module load — generate synthetic
  quads, import into backend (`searchIndexOnImport: "disabled"` on LibSQL), wire
  Comunica `queryEngine`.
- **Execute** (timed): `Deno.bench` calls `sparqlEngine.execute()` only,
  post-preload.
- **Query shape**: **selective** — `SELECT ?p ?o WHERE { <urn:entity:0> ?p ?o }`
  (subject-bound; production hot path).
- Denokv import uses [kv-toolbox](https://github.com/kitsonk/kv-toolbox)
  `batchedAtomic()` for KV commit limits.
- **Not measured**: peak RSS / heap (profile preload separately if needed).

Unbound `?s ?p ?o LIMIT 100` (**fullScan**) benches are opt-in
(`BENCH_HEXASTORE_PERF_FULL_SCAN=1`); skipped here — slow and not the primary
integration shape.

## Preload (import + engine wiring)

| Quads  | libsqlStore | denokvStore |
| :----- | :---------- | :---------- |
| 1 000  | 139 ms      | 367 ms      |
| 5 000  | 584 ms      | 5.6 s       |
| 10 000 | 874 ms      | 16.3 s      |
| 25 000 | 2.2 s       | 101 s       |
| 50 000 | 4.4 s       | 229 s       |

## Execute (selective SPARQL avg)

| Quads  | libsqlStore | denokvStore |
| :----- | :---------- | :---------- |
| 1 000  | 2.9 ms      | 12.4 ms     |
| 5 000  | 4.8 ms      | 5.3 ms      |
| 10 000 | 8.1 ms      | 3.3 ms      |
| 25 000 | 19.2 ms     | 4.0 ms      |
| 50 000 | 32.7 ms     | 5.2 ms      |

## Commands

```bash
deno task bench:hexastore-perf-libsql
deno task bench:hexastore-perf-denokv
```
