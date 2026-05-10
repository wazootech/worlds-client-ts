import type * as rdfjs from "@rdfjs/types";

/**
 * SearchFilters provides standard scoping properties usable by both include and exclude vectors.
 */
export interface SearchFilters {
  /** Limit results to specific subject IRIs. */
  subjects?: Array<string>;

  /** Limit results to specific predicates. */
  predicates?: Array<string>;

  /** Limit by specific object rdf:types. */
  types?: Array<string>;
}

/**
 * SearchRequest defines the parameters for executing a search.
 */
export interface SearchRequest {
  /** Search text to query against. */
  query: string;

  /** Page size for limiting result output. */
  pageSize?: number;

  /** Cursor for iterating to the next result set. */
  pageToken?: string;

  /** Filter conditions limiting where the system searches. */
  include?: SearchFilters;

  /** Filter conditions explicitly excluding hits. */
  exclude?: SearchFilters;

  /** Selected execution algorithm. */
  mode?: "hybrid" | "vector" | "fts";

  /** Influence of vector vs full-text matching. */
  weights?: {
    vector?: number;
    fts?: number;
  };
}

/**
 * SearchResponse packages the list of hits and potential pagination context.
 */
export interface SearchResponse {
  /** Found matches. */
  results?: Array<SearchResult>;

  /** Opaque token pointing to the next page of results. */
  nextPageToken?: string;
}

/**
 * A specific match from the graph including the triple source and relevance scores.
 */
export interface SearchResult {
  subject: string;
  predicate: string;
  object: string;
  vecRank?: number | null;
  ftsRank?: number | null;
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

      // 3. Type Filter: Only inspect Literals for local keyword searching
      if (quad.object.termType === "Literal") {
        const value = quad.object.value;
        if (value.toLowerCase().includes(query)) {
          results.push({
            subject: quad.subject.value,
            predicate: quad.predicate.value,
            object: value,
            score: 1.0,
            ftsRank: 1,
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
