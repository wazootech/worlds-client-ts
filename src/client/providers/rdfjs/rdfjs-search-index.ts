import type * as rdfjs from "@rdfjs/types";
import type {
  SearchIndexInterface,
  SearchRequest,
  SearchResponse,
  SearchResult,
} from "#/client/search-index/search-index-interface.ts";
import { filterQuads } from "#/client/quad-store/quad-filter.ts";
import { isTextualLiteral } from "#/client/quad-store/is-textual-literal.ts";

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

    // 🛡️ Pre-compile the centralized O(1) execution gate from the request payload
    const matcher = filterQuads(request);

    await new Promise<void>((resolve, reject) => {
      stream.on("data", (quad: rdfjs.Quad) => {
        // 1. Evaluate Centralized Boundary Filters
        if (!matcher(quad)) {
          return;
        }

        // 2. Text Filter: Match ONLY canonical textual physical literals
        if (isTextualLiteral(quad.object)) {
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
