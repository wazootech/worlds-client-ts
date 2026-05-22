import type { QuadFilter } from "../quad-store/mod.ts";

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
}
