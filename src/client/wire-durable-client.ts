import { Client } from "@/client/client.ts";
import type { ClientCapabilities } from "@/client/client-capabilities.ts";
import type { ClientInterface } from "@/client/client.ts";
import type { ComunicaQueryEngine } from "@/client/adapters/comunica/mod.ts";
import { ComunicaSparqlEngine } from "@/client/adapters/comunica/mod.ts";
import type { QuadStoreInterface } from "@/client/quad-store/mod.ts";
import type { SearchIndexInterface } from "@/client/search-index/mod.ts";
import type * as rdfjs from "@rdfjs/types";

/**
 * WireDurableClientOptions configures shared durable Client assembly after backend init.
 */
export interface WireDurableClientOptions {
  /** quadStore is the topology-specific QuadStoreInterface facade. */
  quadStore: QuadStoreInterface;

  /** searchIndex is the hybrid or scan search facade wired for this backend. */
  searchIndex: SearchIndexInterface;

  /** capabilities documents search index topology for integrators and agents. */
  capabilities: ClientCapabilities;

  /** rdfjsStoreForSparql is the hexastore-backed RDF/JS store used when queryEngine is set. */
  rdfjsStoreForSparql: rdfjs.Store & { commit(): Promise<void> };

  /** queryEngine optionally enables built-in Comunica SPARQL with buffered commit. */
  queryEngine?: ComunicaQueryEngine;
}

/**
 * wireDurableClient assembles a Client from durable quad, search, and optional SPARQL dependencies.
 */
export function wireDurableClient(
  options: WireDurableClientOptions,
): ClientInterface {
  const sparqlEngine = options.queryEngine
    ? new ComunicaSparqlEngine({
      queryEngine: options.queryEngine,
      store: options.rdfjsStoreForSparql,
      onVoid: () => options.rdfjsStoreForSparql.commit(),
    })
    : undefined;

  return new Client({
    quadStore: options.quadStore,
    searchIndex: options.searchIndex,
    sparqlEngine,
    capabilities: options.capabilities,
  });
}
