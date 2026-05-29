# LibSQL SPARQL at scale

Runnable companion to
[#68](https://github.com/wazootech/worlds-client-ts/issues/68) and README
**Scale and SPARQL query shape**.

```bash
deno task example:libsql-sparql-scale
```

Uses `createLibsqlClient` + `Client` with inline SPARQL strings:

- **Selective:** subject-bound `SELECT ?p ?o WHERE { <iri> ?p ?o }` — default
  for production hot paths.
- **Capped scan:** `SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT n` — small graphs
  and debugging only.

Crossover numbers and methodology:
[discussion #69](https://github.com/wazootech/worlds-client-ts/discussions/69),
[`benchmarks/README.md`](../../benchmarks/README.md).

**JSR:** [`@worlds/client`](https://jsr.io/@worlds/client) ships batched
hydration, query-shape helpers, and scale guidance.
