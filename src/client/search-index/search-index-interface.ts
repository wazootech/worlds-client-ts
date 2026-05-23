import type { QuadFilter } from "@/client/quad-store/mod.ts";

/**
 * SearchRequest defines the parameters for executing a keyword search, extending central QuadFilter rules.
 */
export interface SearchRequest extends QuadFilter {
  /** The fuzzy text query evaluated against the graph's Literal objects. */
  query: string;
}

/**
 * SearchResponse packages the set of discovered triple hits.
 */
export interface SearchResponse {
  /** Total collected hits matching criteria. */
  results?: Array<SearchResult>;
}

/**
 * RebuildSearchIndexRequest scopes repair to quads matching QuadFilter boundaries.
 */
export interface RebuildSearchIndexRequest {
  /** quadFilter limits which durable quads are scanned (e.g. graphs include). */
  quadFilter?: QuadFilter;
  /** readPageSize limits quads per SQL page during scan (default 1000). */
  readPageSize?: number;
}

/**
 * RebuildSearchIndexResponse reports repair counts (idempotent rerun safe).
 */
export interface RebuildSearchIndexResponse {
  /** processedQuadCount is the number of durable quads scanned during repair. */
  processedQuadCount: number;
  /** chunkRowCount is the number of chunk rows written to FTS/vector tables. */
  chunkRowCount: number;
}

/**
 * SearchResult is a hybrid keyword/vector hit against an RDF literal.
 */
export interface SearchResult {
  /** id is the stable deterministic identifier for ranking and evaluation. */
  id: string;

  /** subject is the subject resource of the hit */
  subject: string;

  /** predicate is the predicate resource of the hit */
  predicate: string;

  /** graph is the specific graph context that housed this statement */
  graph: string;

  /** text is the literal object of the hit */
  text: string;

  /**
   * score is the combined rank of the hit (Reciprocal Rank Fusion).
   */
  score: number;
}

/**
 * SearchIndexInterface provides capability to query the system's search indices.
 */
export interface SearchIndexInterface {
  /**
   * search executes a keyword query against the indexed graph data.
   *
   * @param request contains the raw query string and optional include/exclude boundary filters.
   * @returns promise resolving to a set of relevancy-ranked triple matches.
   */
  search(request: SearchRequest): Promise<SearchResponse>;

  /**
   * rebuildSearchIndex rebuilds FTS/vector chunks from durable quads (LibSQL adapters only).
   *
   * @param request optional quadFilter scope and read page size.
   * @returns promise resolving to processed quad and chunk row counts.
   */
  rebuildSearchIndex?(
    request?: RebuildSearchIndexRequest,
  ): Promise<RebuildSearchIndexResponse>;
}
