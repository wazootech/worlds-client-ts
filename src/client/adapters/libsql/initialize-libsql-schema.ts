import type { Client as LibsqlClient } from "@libsql/client";
import type { LibsqlQueryBuilder } from "./libsql-query-builder.ts";

/**
 * initializeLibsqlSchema synchronously checks and creates the full set of persistent tables needed.
 * Hexastore covering indexes enable LibsqlStore selective SPARQL without full hydration
 * (see https://github.com/wazootech/worlds-client-ts/discussions/45).
 */
export async function initializeLibsqlSchema(
  databaseClient: LibsqlClient,
  queryBuilder: LibsqlQueryBuilder,
): Promise<void> {
  await databaseClient.execute(queryBuilder.buildLibsqlQuadsTable());
  for (const ddl of queryBuilder.buildHexastoreIndexes()) {
    await databaseClient.execute(ddl);
  }
  await databaseClient.execute(queryBuilder.buildLibsqlChunksTable());
  await databaseClient.execute(queryBuilder.buildLibsqlChunksQuadIdIndex());
  await databaseClient.execute(queryBuilder.buildLibsqlChunksFtsTable());
  await databaseClient.execute(queryBuilder.buildLibsqlChunksIndex());
  for (const sql of queryBuilder.buildLibsqlChunksTriggers()) {
    await databaseClient.execute(sql);
  }
}
