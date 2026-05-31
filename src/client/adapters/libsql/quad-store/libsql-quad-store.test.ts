import { registerQuadStoreContractTests } from "@/client/quad-store/quad-store-interface.contract.test.ts";
import { type Client, createClient } from "@libsql/client";

import { LibsqlQuadStore } from "./mod.ts";
import { LibsqlRdfjsStore } from "../rdfjs-store/mod.ts";
import { createLibsqlPersistHooks } from "../rdfjs-store/sync/create-libsql-persist-hooks.ts";
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
  const persistHooks = createLibsqlPersistHooks({
    client,
    libsqlQueryBuilder: testLibsqlQueryBuilder,
    textSplitter: sharedTextSplitter,
    searchIndexOnImport: "disabled",
  });
  const libsqlRdfjsStore = new LibsqlRdfjsStore({
    client,
    queryBuilder: testLibsqlQueryBuilder,
    commitHandler: persistHooks.commitHandler,
  });
  return {
    client,
    store: new LibsqlQuadStore({
      libsqlRdfjsStore,
      beforeImport: persistHooks.beforeImport,
      afterImport: persistHooks.afterImport,
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
