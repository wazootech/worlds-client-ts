import type * as rdfjs from "@rdfjs/types";
import { DataFactory } from "n3";
import type {
  SearchIndexInterface,
  SearchRequest,
  SearchResponse,
  SearchResult,
} from "@/client/search-index/mod.ts";
import {
  filterQuads,
  hashQuad,
  isTextualLiteral,
} from "@/client/quad-store/mod.ts";
import type { SerializedQuad } from "./denokv-quad-store.ts";
import { deserializeTerm } from "./denokv-quad-store.ts";

const { quad } = DataFactory;

/**
 * DenokvSearchIndexOptions provides configurations for operating direct Kv search scans.
 */
export interface DenokvSearchIndexOptions {
  /** kv is the target Deno Kv instance holding the persistent quads. */
  kv: Deno.Kv;

  /** keyPrefix restricts target dataset range iteration, defaults to ["quads"]. */
  keyPrefix?: Deno.KvKey;
}

/**
 * DenokvSearchIndex implements keyword search by scanning every quad under a KV prefix.
 * Each entry is deserialized and matched with a naive case-insensitive includes() check.
 * This avoids building a full in-memory N3 graph (unlike SPARQL hydration) but is O(N)
 * per query with no index and no early exit when a match is found.
 */
export class DenokvSearchIndex implements SearchIndexInterface {
  public constructor(
    private readonly options: DenokvSearchIndexOptions,
  ) {}

  public async search(request: SearchRequest): Promise<SearchResponse> {
    const query = request.query.toLowerCase();
    const keyPrefix = this.options.keyPrefix ?? ["quads"];
    const results: Array<SearchResult> = [];

    // 🛡️ Compile the centralized O(1) filter gate
    const matcher = filterQuads(request);

    const iter = this.options.kv.list<SerializedQuad>({ prefix: keyPrefix });

    for await (const entry of iter) {
      const serialized = entry.value;
      if (!serialized) continue;

      // 1. Ephemeral deserialization for evaluation boundaries
      const q = quad(
        deserializeTerm(serialized.subject) as rdfjs.Quad_Subject,
        deserializeTerm(serialized.predicate) as rdfjs.Quad_Predicate,
        deserializeTerm(serialized.object) as rdfjs.Quad_Object,
        deserializeTerm(serialized.graph) as rdfjs.Quad_Graph,
      );

      // 2. Filter Scope evaluation
      if (!matcher(q)) {
        continue;
      }

      // 3. Case-insensitive text scans
      if (isTextualLiteral(q.object)) {
        const value = q.object.value;
        if (value.toLowerCase().includes(query)) {
          results.push({
            id: await hashQuad(q),
            subject: q.subject.value,
            predicate: q.predicate.value,
            graph: q.graph.value,
            text: value,
            score: 1.0,
          });
        }
      }
    }

    return { results };
  }
}
