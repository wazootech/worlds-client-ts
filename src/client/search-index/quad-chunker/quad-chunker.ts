import type { Quad } from "@rdfjs/types";
import { hashQuad } from "#/client/quad-store/hash.ts";

/**
 * ChunkRowPayload is the standardized structure of data that will be inserted into the FTS table.
 */
export interface ChunkRowPayload {
  /** quad_id is the unique canonical identifier of the originating triple. */
  quad_id: string;
  subject: string;
  predicate: string;
  graph: string;
  value: string;
}

/**
 * Document represents the standard structure expected from LangChain splitters, allowing batch operations.
 */
export interface Document {
  pageContent: string;
  metadata?: Record<string, unknown>;
}

/**
 * TextSplitterInterface defines the generic contract for slicing large strings into smaller chunks.
 */
export interface TextSplitterInterface {
  createDocuments(
    texts: string[],
    metadatas?: Record<string, unknown>[],
  ): Promise<Document[]>;
}

/**
 * QuadChunkerOptions are options passed to the QuadChunker constructor.
 */
export interface QuadChunkerOptions {
  /** An injected engine used to break large strings into semantic substrings. */
  splitter: TextSplitterInterface;
}

/**
 * QuadChunker is responsible for deterministically splitting RDF literal objects
 * into smaller semantic text chunks ready for vector vector ingestion and FTS indexing.
 */
export class QuadChunker {
  public constructor(private readonly options: QuadChunkerOptions) {}

  /**
   * chunk accepts a collection of RDF Quads, filters literal payload candidates,
   * and returns an aggregated list of standardized storage payloads preserving parent metadata context.
   * Pass preComputedIds for quad IDs already computed via hashQuad to avoid redundant hashing.
   */
  public async chunk(
    quads: Quad[],
    preComputedIds?: string[],
  ): Promise<ChunkRowPayload[]> {
    // Filter valid candidates from the stream.
    const candidates = quads.filter((q) => q.object.termType === "Literal");
    if (candidates.length === 0) {
      return [];
    }

    // Build id map from preComputedIds (parallel to quads) or compute on demand
    let idByQuad: Map<Quad, string>;
    if (preComputedIds) {
      idByQuad = new Map();
      for (let i = 0; i < quads.length; i++) {
        idByQuad.set(quads[i], preComputedIds[i]);
      }
    } else {
      idByQuad = new Map();
      const hashPromises = candidates.map(async (q) => ({
        quad: q,
        id: await hashQuad(q),
      }));
      const resolved = await Promise.all(hashPromises);
      for (const { quad, id } of resolved) {
        idByQuad.set(quad, id);
      }
    }

    // Prepare batched components and associated correlation vectors.
    const texts = candidates.map((q) => q.object.value);
    const metadatas = candidates.map((q) => ({
      quad_id: idByQuad.get(q)!,
      subject: q.subject.value,
      predicate: q.predicate.value,
      graph: q.graph.value,
    }));

    // Execute collective chunking via engine injection.
    const docs = await this.options.splitter.createDocuments(texts, metadatas);

    // Map document partitions back to unified standard storage output.
    return docs.map((doc) => ({
      quad_id: String(doc.metadata?.quad_id ?? ""),
      subject: String(doc.metadata?.subject ?? ""),
      predicate: String(doc.metadata?.predicate ?? ""),
      graph: String(doc.metadata?.graph ?? ""),
      value: doc.pageContent,
    }));
  }
}
