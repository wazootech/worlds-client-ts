import type { Adapter } from "@/client/client.ts";
import type { ComunicaQueryEngine } from "@/client/adapters/comunica/mod.ts";
import { ComunicaSparqlEngine } from "@/client/adapters/comunica/mod.ts";

import type { LibsqlClientBaseOptions } from "./libsql-client-base-options.ts";
import { createLibsqlAdapterFromRdfjsStore } from "./create-libsql-adapter-from-rdfjs-store.ts";
import { createLibsqlAdapterInfrastructure } from "./create-libsql-adapter-infrastructure.ts";
import { LibsqlStore } from "@/client/adapters/libsql/store/mod.ts";

/**
 * LibsqlAdapterOptions configures LibSQL execution through LibsqlStore and hexastore indexes.
 */
export interface LibsqlAdapterOptions extends LibsqlClientBaseOptions {
  /** queryEngine optionally enables built-in Comunica SPARQL over LibsqlStore. */
  queryEngine?: ComunicaQueryEngine;
}

/**
 * createLibsqlAdapter synthesizes a Adapter for direct LibsqlStore + hexastore indexes.
 */
export async function createLibsqlAdapter(
  options: LibsqlAdapterOptions,
): Promise<Adapter> {
  const infrastructure = await createLibsqlAdapterInfrastructure(options);

  const libsqlStore = new LibsqlStore({
    client: options.client,
    queryBuilder: infrastructure.queryBuilder,
    commitHandler: infrastructure.patchSync.persistPatch,
    matchPageSize: options.matchPageSize,
  });

  return createLibsqlAdapterFromRdfjsStore({
    infrastructure,
    rdfjsStore: libsqlStore,
    commitPendingChanges: () => libsqlStore.commit(),
    createSparqlEngine: options.queryEngine
      ? ({ store }) =>
        new ComunicaSparqlEngine({
          queryEngine: options.queryEngine!,
          store,
          onVoid: () => libsqlStore.commit(),
        })
      : undefined,
  });
}
