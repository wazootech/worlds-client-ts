import type * as rdfjs from "@rdfjs/types";

/**
 * DefaultSearchService is the default search service implementation.
 */
export class DefaultSearchService implements SearchServiceInterface {
  public constructor(
    private readonly store: rdfjs.Store,
  ) {}

  public async search(request: SearchRequest): Promise<SearchResponse> {
    return await executeSearch(this.store, request);
  }
}

/**
 * SearchServiceInterface provides an interface for executing searches against the store.
 */
export interface SearchServiceInterface {
  search(request: SearchRequest): Promise<SearchResponse>;
}

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
 * executeSearch executes a keyword search request against an in-memory RDFJS store.
 * Currently performs case-insensitive string inclusion scanning of Literal objects.
 */
export async function executeSearch(
  store: rdfjs.Store,
  request: SearchRequest,
): Promise<SearchResponse> {
  const query = request.query.toLowerCase();
  const stream = store.match(null, null, null, null);
  const results: Array<SearchResult> = [];

  // Prepare fast lookup sets for inclusion/exclusion rules
  const includeSubjects = request.include?.subjects
    ? new Set(request.include.subjects)
    : null;
  const includePreds = request.include?.predicates
    ? new Set(request.include.predicates)
    : null;

  const excludeSubjects = request.exclude?.subjects
    ? new Set(request.exclude.subjects)
    : null;
  const excludePreds = request.exclude?.predicates
    ? new Set(request.exclude.predicates)
    : null;

  await new Promise<void>((resolve, reject) => {
    stream.on("data", (quad: rdfjs.Quad) => {
      // 1. Primary Filter: Exclusions ALWAYS trump
      if (excludeSubjects?.has(quad.subject.value)) return;
      if (excludePreds?.has(quad.predicate.value)) return;

      // 2. Scope Filter: Inclusions strictly limit visibility
      if (includeSubjects && !includeSubjects.has(quad.subject.value)) return;
      if (includePreds && !includePreds.has(quad.predicate.value)) return;

      // 3. Text Filter: Match literal string objects
      if (quad.object.termType === "Literal") {
        const value = quad.object.value;
        if (value.toLowerCase().includes(query)) {
          results.push({
            subject: quad.subject.value,
            predicate: quad.predicate.value,
            object: value,
            score: 1.0,
          });
        }
      }
    });
    stream.on("end", resolve);
    stream.on("error", reject);
  });

  return {
    results,
  };
}
