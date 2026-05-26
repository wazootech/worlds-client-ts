# LibSQL warm container (serverless / edge)

For **Deno Deploy**, **Vercel Edge**, and other **warm isolates**: build a
`Adapter` (or `Client`) **once per isolate** in module scope — not per HTTP
request ([#68](https://github.com/wazootech/worlds-client-ts/issues/68)).

| Entry          | Topology                                              | Command                                                |
| :------------- | :---------------------------------------------------- | :----------------------------------------------------- |
| `hexastore.ts` | Hexastore `LibsqlStore` (production default on edge)  | `deno task example:libsql-n3-warm-container:hexastore` |
| `n3.ts`        | Hydrate once → reuse `store` + one client per isolate | `deno task example:libsql-n3-warm-container:n3`        |

Anti-pattern at scale: omit `store` and call `createLibsqlN3Adapter` on every
request (full re-wire + implicit hydration).

Contrast with long-running services:
[`examples/libsql-long-running`](../libsql-long-running/README.md).

See README **Scale and SPARQL query shape** and
`deno task example:libsql-sparql-scale` for hexastore query-shape guidance.
