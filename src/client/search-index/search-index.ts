import type * as rdfjs from "@rdfjs/types";
import type {
  SearchIndexInterface,
  SearchRequest,
  SearchResponse,
  SearchResult,
} from "./interface.ts";

/**
 * RdfjsSearchIndex is the default search service implementation.
 */
export class RdfjsSearchIndex implements SearchIndexInterface {
  public constructor(
    private readonly store: rdfjs.Store,
  ) {}

  public async search(request: SearchRequest): Promise<SearchResponse> {
    return await executeSearch(this.store, request);
  }
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
