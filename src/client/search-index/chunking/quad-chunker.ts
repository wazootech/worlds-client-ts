import type { Quad } from "@rdfjs/types";

/**
 * ChunkRowPayload is the standardized structure of data that will be inserted into the FTS table.
 */
export interface ChunkRowPayload {
  subject: string;
  predicate: string;
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
   */
  public async chunk(quads: Quad[]): Promise<ChunkRowPayload[]> {
    // Filter valid candidates from the stream.
    const candidates = quads.filter((q) => q.object.termType === "Literal");
    if (candidates.length === 0) {
      return [];
    }

    // Prepare batched components and associated correlation vectors.
    const texts = candidates.map((q) => q.object.value);
    const metadatas = candidates.map((q) => ({
      subject: q.subject.value,
      predicate: q.predicate.value,
    }));

    // Execute collective chunking via engine injection.
    const docs = await this.options.splitter.createDocuments(texts, metadatas);

    // Map document partitions back to unified standard storage output.
    return docs.map((doc) => ({
      subject: String(doc.metadata?.subject ?? ""),
      predicate: String(doc.metadata?.predicate ?? ""),
      value: doc.pageContent,
    }));
  }
}
