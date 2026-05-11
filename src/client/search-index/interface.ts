/**
 * SearchRequest defines the parameters for executing a keyword search.
 */
export interface SearchRequest {
  /** The fuzzy text query evaluated against the graph's Literal objects. */
  query: string;

  /** Positive boundary conditions. If specified, results MUST match these criteria. */
  include?: SearchFilters;

  /** Negative boundary conditions. Results matching these criteria are automatically suppressed. */
  exclude?: SearchFilters;
}

/**
 * SearchFilters provides standard scoping properties usable by both include and exclude vectors.
 */
export interface SearchFilters {
  /**
   * Limit search scope to these specific subject IRIs.
   *
   * @tip This is the intended integration point for SPARQL composition.
   * Run a `client.sparql()` query (e.g., `SELECT ?subject WHERE { ?subject a :Type }`),
   * extract the identifiers, and pass them here to dynamically bound search space.
   */
  subjects?: Array<string>;

  /**
   * Limit search scope to specific attribute predicates.
   * Use this to restrict keyword matching only to certain fields like `rdfs:comment`.
   */
  predicates?: Array<string>;
}

/**
 * SearchResponse packages the set of discovered triple hits.
 */
export interface SearchResponse {
  /** Total collected hits matching criteria. */
  results?: Array<SearchResult>;
}

/**
 * A specific fuzzy match including source coordinates and relevance scoring.
 */
export interface SearchResult {
  subject: string;
  predicate: string;
  object: string;
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
