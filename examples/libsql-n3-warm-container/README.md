# LibSQL N3 warm container

Demonstrates [#68](https://github.com/wazootech/worlds-client-ts/issues/68):
hydrate LibSQL into N3 **once per container**, then pass the same `store` into
`createLibsqlN3Client` for each request.

```bash
deno task example:libsql-n3-warm-container
```

Contrast with per-request hydration (anti-pattern at scale): omit `store` and
let `createLibsqlN3Client` call `hydrateStoreFromLibsql` on every boot.

See README **Scale and SPARQL query shape** and
`deno task example:libsql-sparql-scale` for hexastore (`createLibsqlClient`)
guidance.
