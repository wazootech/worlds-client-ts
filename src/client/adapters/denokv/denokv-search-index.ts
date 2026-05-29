import type * as rdfjs from "@rdfjs/types";
import { DataFactory } from "n3";
import type {
  ReindexRequest,
  ReindexResponse,
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
import type { SerializedQuad } from "./denokv-serialization.ts";
import { deserializeTerm } from "./denokv-serialization.ts";
import {
  buildGenerationDataPrefix,
  buildPrimaryQuadKey,
} from "./denokv-hexastore-keys.ts";
import { readActiveGeneration } from "./denokv-dataset-generation.ts";

const { quad } = DataFactory;

const MAX_KV_BATCH_SIZE = 50;

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
 * DenokvSearchIndex implements keyword search by scanning quads in the active dataset generation.
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

    const matcher = filterQuads(request);

    const generationId = await readActiveGeneration(
      this.options.kv,
      keyPrefix,
    );
    const scopedDataPrefix = buildGenerationDataPrefix(
      keyPrefix,
      generationId,
    );

    const pendingIds: string[] = [];

    const indexIter = this.options.kv.list<string>({
      prefix: [...scopedDataPrefix, "idx_spog"],
    });

    for await (const entry of indexIter) {
      pendingIds.push(entry.value);
      if (pendingIds.length >= MAX_KV_BATCH_SIZE) {
        await scanQuadBatch(
          this.options.kv,
          scopedDataPrefix,
          pendingIds,
          query,
          matcher,
          results,
        );
        pendingIds.length = 0;
      }
    }

    if (pendingIds.length > 0) {
      await scanQuadBatch(
        this.options.kv,
        scopedDataPrefix,
        pendingIds,
        query,
        matcher,
        results,
      );
    }

    return { results };
  }

  /**
   * reindex is a no-op for Deno KV search, which scans quads at query time.
   */
  public reindex(_request?: ReindexRequest): Promise<ReindexResponse> {
    return Promise.resolve({
      processedQuadCount: 0,
      chunkRowCount: 0,
    });
  }
}

async function scanQuadBatch(
  kv: Deno.Kv,
  scopedDataPrefix: Deno.KvKey,
  quadIds: readonly string[],
  query: string,
  matcher: (quad: rdfjs.Quad) => boolean,
  results: SearchResult[],
): Promise<void> {
  const keys = quadIds.map((quadId) =>
    buildPrimaryQuadKey(scopedDataPrefix, quadId)
  );
  const entries = await kv.getMany(keys) as Array<
    Deno.KvEntryMaybe<SerializedQuad>
  >;

  for (const entry of entries) {
    const serialized = entry.value;
    if (!serialized) continue;

    const storedQuad = quad(
      deserializeTerm(serialized.subject) as rdfjs.Quad_Subject,
      deserializeTerm(serialized.predicate) as rdfjs.Quad_Predicate,
      deserializeTerm(serialized.object) as rdfjs.Quad_Object,
      deserializeTerm(serialized.graph) as rdfjs.Quad_Graph,
    );

    if (!matcher(storedQuad)) {
      continue;
    }

    if (isTextualLiteral(storedQuad.object)) {
      const value = storedQuad.object.value;
      if (value.toLowerCase().includes(query)) {
        results.push({
          id: await hashQuad(storedQuad),
          subject: storedQuad.subject.value,
          predicate: storedQuad.predicate.value,
          graph: storedQuad.graph.value,
          text: value,
          score: 1.0,
        });
      }
    }
  }
}
