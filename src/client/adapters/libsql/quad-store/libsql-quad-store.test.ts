import { registerQuadStoreContractTests } from "@/client/quad-store/quad-store-interface.contract.test.ts";
import { type Client, createClient } from "@libsql/client";

import { LibsqlQuadStore } from "./mod.ts";
import { LibsqlRdfjsStore } from "../rdfjs-store/mod.ts";
import { createLibsqlCommitSync } from "../rdfjs-store/sync/libsql-commit-sync.ts";
import {
  setupLibsqlSchemaForTest,
  sharedTextSplitter,
  testLibsqlQueryBuilder,
} from "../libsql-test-fixtures.ts";

async function createLibsqlQuadStoreForTest(): Promise<{
  store: LibsqlQuadStore;
  client: Client;
}> {
  const client = createClient({ url: ":memory:" });
  await setupLibsqlSchemaForTest(client);
  const patchSync = createLibsqlCommitSync({
    client,
    libsqlQueryBuilder: testLibsqlQueryBuilder,
    textSplitter: sharedTextSplitter,
    searchIndexOnImport: "disabled",
  });
  const libsqlRdfjsStore = new LibsqlRdfjsStore({
    client,
    queryBuilder: testLibsqlQueryBuilder,
    commitHandler: patchSync.commit,
  });
  return {
    client,
    store: new LibsqlQuadStore({
      libsqlRdfjsStore,
      importLifecycle: patchSync,
    }),
  };
}

registerQuadStoreContractTests({
  label: "LibsqlQuadStore",
  setup: async () => {
    const { store, client } = await createLibsqlQuadStoreForTest();
    return {
      store,
      cleanup: () => {
        client.close();
      },
    };
  },
});
