import type * as rdfjs from "@rdfjs/types";
import type {
  SearchIndexInterface,
  SearchRequest,
  SearchResponse,
  SearchResult,
} from "#/client/search-index/interface.ts";

/**
 * RdfjsSearchIndex is the implementation of SearchIndexInterface that uses an RDF/JS store.
 */
export class RdfjsSearchIndex implements SearchIndexInterface {
  public constructor(
    private readonly store: rdfjs.Store,
  ) {}

  public async search(request: SearchRequest): Promise<SearchResponse> {
    const query = request.query.toLowerCase();
    const stream = this.store.match(null, null, null, null);
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
    const excludeGraphs = request.exclude?.graphs
      ? new Set(request.exclude.graphs)
      : null;

    const includeGraphs = request.include?.graphs
      ? new Set(request.include.graphs)
      : null;

    await new Promise<void>((resolve, reject) => {
      stream.on("data", (quad: rdfjs.Quad) => {
        // 1. Primary Filter: Exclusions ALWAYS trump
        if (excludeSubjects?.has(quad.subject.value)) return;
        if (excludePreds?.has(quad.predicate.value)) return;
        if (excludeGraphs?.has(quad.graph.value)) return;

        // 2. Scope Filter: Inclusions strictly limit visibility
        if (includeSubjects && !includeSubjects.has(quad.subject.value)) return;
        if (includePreds && !includePreds.has(quad.predicate.value)) return;
        if (includeGraphs && !includeGraphs.has(quad.graph.value)) return;

        // 3. Text Filter: Match literal string objects
        if (quad.object.termType === "Literal") {
          const value = quad.object.value;
          if (value.toLowerCase().includes(query)) {
            results.push({
              subject: quad.subject.value,
              predicate: quad.predicate.value,
              graph: quad.graph.value,
              text: value,
              score: 1.0,
            });
          }
        }
      });
      stream.on("end", resolve);
      stream.on("error", reject);
    });

    return { results };
  }
}
