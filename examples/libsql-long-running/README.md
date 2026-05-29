# LibSQL long-running service

For **Fly.io**, **DigitalOcean App Platform**, and other **24/7** Deno/Node
processes: build an `Adapter` once at boot and hold one `Client` for the process
lifetime.

| Entry          | Topology                                          | Command                                           |
| :------------- | :------------------------------------------------ | :------------------------------------------------ |
| `hexastore.ts` | Hexastore `LibsqlRdfjsStore` (production default) | `deno task example:libsql-long-running:hexastore` |

SPARQL runs on `LibsqlRdfjsStore` via `createLibsqlAdapter({ queryEngine })` —
no full N3 mirror per request.

The hexastore example requires local USE artifacts: run
`deno task download:tfjs-use` before `example:libsql-long-running:hexastore`.

For SPARQL query-shape guidance at scale, see
[`examples/libsql-sparql-scale`](../libsql-sparql-scale/main.ts) and
[#68](https://github.com/wazootech/worlds-client-ts/issues/68).
