import type { Quad } from "@rdfjs/types";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

export interface ChunkRowPayload {
  subject: string;
  predicate: string;
  value: string;
}

export interface QuadChunkerOptions {
  chunkSize?: number;
  chunkOverlap?: number;
}

/**
 * QuadChunker is responsible for deterministically splitting RDF literal objects
 * into smaller semantic text chunks ready for vector vector ingestion and FTS indexing.
 */
export class QuadChunker {
  private readonly splitter: RecursiveCharacterTextSplitter;

  constructor(options: QuadChunkerOptions = {}) {
    this.splitter = new RecursiveCharacterTextSplitter({
      chunkSize: options.chunkSize ?? 1000,
      chunkOverlap: options.chunkOverlap ?? 200,
    });
  }

  /**
   * chunk accepts an RDF Quad, evaluates its object node, and yields an array of
   * standardized storage payload objects.
   */
  public async chunk(quad: Quad): Promise<ChunkRowPayload[]> {
    // Protect against non-literal types
    if (quad.object.termType !== "Literal") {
      return [];
    }

    const text = quad.object.value;

    // Execute splitting
    const docs = await this.splitter.createDocuments([text]);

    // Map each generated document chunk to output structure
    return docs.map((doc) => ({
      subject: quad.subject.value,
      predicate: quad.predicate.value,
      value: doc.pageContent,
    }));
  }
}
