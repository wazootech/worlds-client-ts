import type { ClientInterface } from "@/client/client.ts";
import type { ComunicaQueryEngine } from "@/client/adapters/comunica/mod.ts";
import { ComunicaSparqlEngine } from "@/client/adapters/comunica/mod.ts";

import type { LibsqlClientBaseOptions } from "./libsql-client-base-options.ts";
import { createLibsqlClientFromStores } from "./create-libsql-client-from-stores.ts";
import { createLibsqlClientInfrastructure } from "./create-libsql-client-infrastructure.ts";
import { LibsqlQuadStore } from "./libsql-quad-store.ts";
import { LibsqlRdfjsStore } from "./libsql-rdfjs-store.ts";

/**
 * LibsqlClientOptions configures LibSQL execution through LibsqlRdfjsStore and hexastore indexes.
 */
export interface LibsqlClientOptions extends LibsqlClientBaseOptions {
  /** queryEngine optionally enables built-in Comunica SPARQL over LibsqlRdfjsStore. */
  queryEngine?: ComunicaQueryEngine;
}

/**
 * createLibsqlClient synthesizes a Client for LibsqlRdfjsStore + LibsqlQuadStore hexastore indexes.
 */
export async function createLibsqlClient(
  options: LibsqlClientOptions,
): Promise<ClientInterface> {
  const infrastructure = await createLibsqlClientInfrastructure(options);

  const libsqlRdfjsStore = new LibsqlRdfjsStore({
    client: options.client,
    queryBuilder: infrastructure.queryBuilder,
    commitHandler: infrastructure.patchSync.persistPatch,
    matchPageSize: options.matchPageSize,
  });

  const libsqlQuadStore = new LibsqlQuadStore({
    libsqlRdfjsStore,
    importLifecycle: infrastructure.patchSync,
  });

  return createLibsqlClientFromStores({
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
