# LibSQL long-running service

For **Fly.io**, **DigitalOcean App Platform**, and other **24/7** Deno/Node
processes: build a `Adapter` once at boot and hold one `Client` for the process
lifetime.

| Entry          | Topology                                     | Command                                           |
| :------------- | :------------------------------------------- | :------------------------------------------------ |
| `hexastore.ts` | Hexastore `LibsqlStore` (production default) | `deno task example:libsql-long-running:hexastore` |
| `n3.ts`        | Hydrate → N3 + patch sync                    | `deno task example:libsql-long-running:n3`        |

Hexastore example requires local USE artifacts: `deno task download:tfjs-use`
before `example:libsql-long-running:hexastore`.

Contrast with serverless warm isolates:
[`examples/libsql-n3-warm-container`](../libsql-n3-warm-container/README.md).
