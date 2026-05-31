import type * as rdfjs from "@rdfjs/types";
import { DataFactory } from "n3";
import { EventEmitter } from "node:events";
import type {
  CommitHandler,
  PatchCommitContext,
} from "@/client/quad-store/mod.ts";
import { deduplicatePatchBuffers } from "@/client/quad-store/mod.ts";

const { namedNode } = DataFactory;

type MatchFunction = (
  subject?: rdfjs.Term | null,
  predicate?: rdfjs.Term | null,
  object?: rdfjs.Term | null,
  graph?: rdfjs.Term | null,
) => rdfjs.Stream<rdfjs.Quad>;

/**
 * BufferedRdfjsPatchState owns insert/delete buffers and RDF/JS Store mutation helpers
 * shared by durable hexastore-backed Store implementations.
 */
export class BufferedRdfjsPatchState {
  /** insertBuffer collects quads queued for insertion. */
  private insertBuffer: rdfjs.Quad[] = [];

  /** deleteBuffer collects quads queued for deletion. */
  private deleteBuffer: rdfjs.Quad[] = [];

  /**
   * add buffers a single quad for insertion on the next commit.
   */
  public add(quad: rdfjs.Quad): this {
    this.insertBuffer.push(quad);
    return this;
  }

  /**
   * addQuad buffers a single quad for insertion on the next commit.
   */
  public addQuad(quad: rdfjs.Quad): this {
    return this.add(quad);
  }

  /**
   * addQuads buffers multiple quads for insertion on the next commit.
   */
  public addQuads(quads: rdfjs.Quad[]): this {
    for (const quad of quads) {
      this.insertBuffer.push(quad);
    }
    return this;
  }

  /**
   * removeQuads buffers multiple quads for deletion on the next commit.
   */
  public removeQuads(quads: rdfjs.Quad[]): this {
    for (const quad of quads) {
      this.deleteBuffer.push(quad);
    }
    return this;
  }

  /**
   * delete buffers a single quad for deletion on the next commit.
   */
  public delete(quad: rdfjs.Quad): this {
    this.deleteBuffer.push(quad);
    return this;
  }

  /**
   * import consumes an RDF/JS stream, buffering all quads for later commit.
   */
  public import(stream: rdfjs.Stream<rdfjs.Quad>): EventEmitter {
    return bridgeStreamToBuffer(stream, this.insertBuffer);
  }

  /**
   * remove consumes a stream and buffers all quads from it for deletion on commit.
   */
  public remove(stream: rdfjs.Stream<rdfjs.Quad>): EventEmitter {
    return bridgeStreamToBuffer(stream, this.deleteBuffer);
  }

  /**
   * removeMatches buffers all quads matching the given quad pattern for deletion on commit.
   */
  public removeMatches(
    match: MatchFunction,
    subject?: rdfjs.Term | null,
    predicate?: rdfjs.Term | null,
    object?: rdfjs.Term | null,
    graph?: rdfjs.Term | null,
  ): EventEmitter {
    const stream = match(subject, predicate, object, graph);
    return bridgeStreamToBuffer(stream, this.deleteBuffer);
  }

  /**
   * deleteGraph buffers all quads in the named graph for deletion on commit.
   */
  public deleteGraph(
    match: MatchFunction,
    graph: rdfjs.Term | string,
  ): EventEmitter {
    const graphTerm = typeof graph === "string" ? namedNode(graph) : graph;
    return this.removeMatches(match, null, null, null, graphTerm);
  }

  /**
   * flushCommit deduplicates buffers and persists through commitHandler or fallback.
   */
  public async flushCommit(
    commitHandler: CommitHandler | undefined,
    context?: PatchCommitContext,
    fallbackCommitHandler?: CommitHandler,
  ): Promise<void> {
    deduplicatePatchBuffers(this.insertBuffer, this.deleteBuffer);
    if (this.insertBuffer.length === 0 && this.deleteBuffer.length === 0) {
      return;
    }

    const patch = {
      insertions: this.insertBuffer,
      deletions: this.deleteBuffer,
    };

    if (commitHandler) {
      await commitHandler(patch, context);
    } else if (fallbackCommitHandler) {
      await fallbackCommitHandler(patch, context);
    }

    this.clearBuffer();
  }

  /**
   * clearBuffer discards any uncommitted insertions and deletions.
   */
  public clearBuffer(): void {
    this.insertBuffer = [];
    this.deleteBuffer = [];
  }
}

function bridgeStreamToBuffer(
  stream: rdfjs.Stream<rdfjs.Quad>,
  targetBuffer: rdfjs.Quad[],
): EventEmitter {
  const emitter = new EventEmitter();
  stream.on("data", (quad: rdfjs.Quad) => {
    targetBuffer.push(quad);
  });
  stream.on("end", () => {
    emitter.emit("end");
  });
  stream.on("error", (error: Error) => {
    emitter.emit("error", error);
  });
  return emitter;
}
