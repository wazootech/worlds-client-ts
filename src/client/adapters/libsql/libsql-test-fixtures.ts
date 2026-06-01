import type { Client } from "@libsql/client";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import {
  initializeLibsqlSchema,
  LibsqlQueryBuilder,
} from "@/client/adapters/libsql/mod.ts";

/** testLibsqlQueryBuilder is the shared query builder used by LibSQL adapter tests. */
export const testLibsqlQueryBuilder = new LibsqlQueryBuilder(32);

/** sharedTextSplitter is the default text splitter for LibSQL search commit tests. */
export const sharedTextSplitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
});

/**
 * setupLibsqlSchemaForTest initializes the LibSQL schema for adapter tests.
 */
export async function setupLibsqlSchemaForTest(
  client: Client,
): Promise<void> {
  await initializeLibsqlSchema(client, testLibsqlQueryBuilder);
}
