import type { Adapter } from "@/client/client.ts";
import type { ComunicaQueryEngine } from "@/client/adapters/comunica/mod.ts";
import { ComunicaSparqlEngine } from "@/client/adapters/comunica/mod.ts";

import type { LibsqlClientBaseOptions } from "./libsql-client-base-options.ts";
import { createLibsqlAdapterFromStores } from "./create-libsql-adapter-from-stores.ts";
import { createLibsqlAdapterInfrastructure } from "./create-libsql-adapter-infrastructure.ts";
import { LibsqlQuadStore } from "./libsql-quad-store.ts";
import { LibsqlRdfjsStore } from "./libsql-rdfjs-store.ts";

/**
 * LibsqlAdapterOptions configures LibSQL execution through LibsqlRdfjsStore and hexastore indexes.
 */
export interface LibsqlAdapterOptions extends LibsqlClientBaseOptions {
  /** queryEngine optionally enables built-in Comunica SPARQL over LibsqlRdfjsStore. */
  queryEngine?: ComunicaQueryEngine;
}

/**
 * createLibsqlAdapter synthesizes a Adapter for LibsqlRdfjsStore + LibsqlQuadStore hexastore indexes.
 */
export async function createLibsqlAdapter(
  options: LibsqlAdapterOptions,
): Promise<Adapter> {
  const infrastructure = await createLibsqlAdapterInfrastructure(options);

  const libsqlRdfjsStore = new LibsqlRdfjsStore({
    client: options.client,
    queryBuilder: infrastructure.queryBuilder,
    commitHandler: infrastructure.patchSync.persistPatch,
    matchPageSize: options.matchPageSize,
  });

  const libsqlQuadStore = new LibsqlQuadStore({
    libsqlRdfjsStore,
    patchSync: infrastructure.patchSync,
  });

  return createLibsqlAdapterFromStores({
    infrastructure,
    libsqlQuadStore,
    libsqlRdfjsStore,
    createSparqlEngine: options.queryEngine
      ? ({ store }) =>
        new ComunicaSparqlEngine({
          queryEngine: options.queryEngine!,
          store,
          onVoid: () => libsqlRdfjsStore.commit(),
        })
      : undefined,
  });
}
