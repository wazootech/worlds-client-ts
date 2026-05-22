# LibSQL SPARQL at scale

Runnable companion to
[#68](https://github.com/wazootech/worlds-client-ts/issues/68) and README
**Scale and SPARQL query shape**.

```bash
deno task example:libsql-sparql-scale
```

Uses `createLibsqlClient` with query helpers from
`@worlds/client/adapters/libsql`:

- **Selective:** `createSubjectBoundPropertiesSparqlQuery(subjectIri)` — default
  for production hot paths.
- **Capped scan:** `createCappedUnboundTriplePatternSparqlQuery(limit)` — small
  graphs and debugging only.

Crossover numbers and methodology:
[discussion #69](https://github.com/wazootech/worlds-client-ts/discussions/69),
[`benchmarks/README.md`](../../benchmarks/README.md).

**JSR:** `@worlds/client@0.0.6` ships batched hydration, query-shape helpers,
and scale guidance.
