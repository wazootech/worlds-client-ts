import type { Client } from "@libsql/client";
import type * as rdfjs from "@rdfjs/types";
import { DataFactory } from "n3";
import { Readable } from "node:stream";
import { EventEmitter } from "node:events";
import type { LibsqlQueryBuilder } from "./libsql-query-builder.ts";
import { DEFAULT_LIBSQL_MATCH_PAGE_SIZE } from "./libsql-query-builder.ts";
import type {
  CommitHandler,
  PatchCommitContext,
} from "@/client/quad-store/mod.ts";
import { deduplicatePatchBuffers } from "@/client/quad-store/mod.ts";
import { quadFromLibsqlRow } from "./libsql-quad-row.ts";

export type { CommitHandler, PatchCommitContext };

const { namedNode } = DataFactory;

/**
 * LibsqlRdfjsStoreOptions configures LibsqlRdfjsStore dependencies and read behavior.
 */
export interface LibsqlRdfjsStoreOptions {
  /** client is the LibSQL client. */
  client: Client;

  /** queryBuilder is the LibsqlQueryBuilder. */
  queryBuilder: LibsqlQueryBuilder;

  /** commitHandler atomically persists buffered patches on commit(). */
  commitHandler?: CommitHandler;

  /** matchPageSize limits rows per hexastore match SQL round-trip (default 1000). */
  matchPageSize?: number;
}

/**
 * LibsqlRdfjsStore is a full RDF/JS Store implementation backed by LibSQL and hexastore covering indexes.
 * All triple/quad patterns resolve via a single SQL index seek with no in-memory hydration needed.
 */
export class LibsqlRdfjsStore implements rdfjs.Store {
  /**
   * insertBuffer collects quads queued for insertion. Committed atomically via commit().
   */
  private insertBuffer: rdfjs.Quad[] = [];

  /**
   * deleteBuffer collects quads queued for deletion. Committed atomically via commit().
   */
  private deleteBuffer: rdfjs.Quad[] = [];

  private readonly matchPageSize: number;

  public constructor(
    private readonly options: LibsqlRdfjsStoreOptions,
  ) {
    const configuredPageSize = options.matchPageSize ??
      DEFAULT_LIBSQL_MATCH_PAGE_SIZE;
    this.matchPageSize = Math.max(1, Math.floor(configuredPageSize));
  }

  /**
   * match returns a stream of quads matching the given quad pattern.
   * Automatically selects the optimal hexastore covering index based on
   * which pattern positions are bound. Reads are keyset-paged by quad id.
   */
  public match(
    subject?: rdfjs.Term | null,
    predicate?: rdfjs.Term | null,
    object?: rdfjs.Term | null,
    graph?: rdfjs.Term | null,
  ): rdfjs.Stream<rdfjs.Quad> {
    const pattern = {
      subject: subject ?? null,
      predicate: predicate ?? null,
      object: object ?? null,
      graph: graph ?? null,
    };

    let afterQuadId: string | undefined;
    let streamFinished = false;

    const rowStream = new Readable({
      objectMode: true,
      read: async () => {
        if (streamFinished) {
          return;
        }

        try {
          const { sql, args } = this.options.queryBuilder.buildMatchQuadsQuery(
            pattern,
            {
              afterQuadId,
              limit: this.matchPageSize,
            },
          );
          const resultSet = await this.options.client.execute({ sql, args });

          if (resultSet.rows.length === 0) {
            rowStream.push(null);
            streamFinished = true;
            return;
          }

          for (const row of resultSet.rows) {
            afterQuadId = String(row.id);
            rowStream.push(quadFromLibsqlRow(row));
          }

          if (resultSet.rows.length < this.matchPageSize) {
            rowStream.push(null);
            streamFinished = true;
          }
        } catch (error) {
          rowStream.destroy(error as Error);
          streamFinished = true;
        }
      },
    });

    return rowStream as unknown as rdfjs.Stream<rdfjs.Quad>;
  }

  /**
   * countQuads returns the number of quads matching the given quad pattern (Comunica cardinality hint).
   */
  public async countQuads(
    subject?: rdfjs.Term | null,
    predicate?: rdfjs.Term | null,
    object?: rdfjs.Term | null,
    graph?: rdfjs.Term | null,
  ): Promise<number> {
    const { sql, args } = this.options.queryBuilder.buildCountQuadsQuery({
      subject: subject ?? null,
      predicate: predicate ?? null,
      object: object ?? null,
      graph: graph ?? null,
    });
    const resultSet = await this.options.client.execute({ sql, args });
    const firstRow = resultSet.rows[0];
    if (!firstRow) {
      return 0;
    }
    const countValue = firstRow.count ?? firstRow["COUNT(*)"];
    return Number(countValue ?? 0);
  }

  /**
   * add buffers a single quad for insertion on the next commit.
   */
  public add(quad: rdfjs.Quad): this {
    this.insertBuffer.push(quad);
    return this;
  }

  /**
   * addQuad buffers a single quad for insertion on the next commit (RDF/JS Store alias for add).
   */
  public addQuad(quad: rdfjs.Quad): this {
    return this.add(quad);
  }

  /**
   * delete buffers a single quad for deletion on the next commit.
   */
  public delete(quad: rdfjs.Quad): this {
    this.deleteBuffer.push(quad);
    return this;
  }

  /**
   * import consumes an RDF/JS Stream, buffering all quads for later commit.
   */
  public import(
    stream: rdfjs.Stream<rdfjs.Quad>,
  ): EventEmitter {
    const emitter = new EventEmitter();
    stream.on("data", (q: rdfjs.Quad) => {
      this.insertBuffer.push(q);
    });
    stream.on("end", () => {
      emitter.emit("end");
    });
    stream.on("error", (err: Error) => {
      emitter.emit("error", err);
    });
    return emitter;
  }

  /**
   * remove consumes a stream and buffers all quads from it for deletion on commit.
   */
  public remove(stream: rdfjs.Stream<rdfjs.Quad>): EventEmitter {
    const emitter = new EventEmitter();
    stream.on("data", (q: rdfjs.Quad) => {
      this.deleteBuffer.push(q);
    });
    stream.on("end", () => {
      emitter.emit("end");
    });
    stream.on("error", (err: Error) => {
      emitter.emit("error", err);
    });
    return emitter;
  }

  /**
   * removeMatches buffers all quads matching the given quad pattern for deletion on commit.
   */
  public removeMatches(
    subject?: rdfjs.Term | null,
    predicate?: rdfjs.Term | null,
    object?: rdfjs.Term | null,
    graph?: rdfjs.Term | null,
  ): EventEmitter {
    const emitter = new EventEmitter();
    const stream = this.match(subject, predicate, object, graph);
    stream.on("data", (q: rdfjs.Quad) => {
      this.deleteBuffer.push(q);
    });
    stream.on("end", () => {
      emitter.emit("end");
    });
    stream.on("error", (err: Error) => {
      emitter.emit("error", err);
    });
    return emitter;
  }

  /**
   * deleteGraph buffers all quads in the named graph for deletion on commit.
   */
  public deleteGraph(graph: rdfjs.Term | string): EventEmitter {
    const graphTerm = typeof graph === "string" ? namedNode(graph) : graph;
    return this.removeMatches(null, null, null, graphTerm);
  }

  /**
   * commit atomically persists all buffered insertions and deletions through
   * the configured CommitHandler. Deduplicates quads that appear in both
   * buffers before invoking the handler.
   */
  public async commit(context?: PatchCommitContext): Promise<void> {
    deduplicatePatchBuffers(this.insertBuffer, this.deleteBuffer);
    if (this.insertBuffer.length === 0 && this.deleteBuffer.length === 0) {
      return;
    }
    if (this.options.commitHandler) {
      await this.options.commitHandler({
        insertions: this.insertBuffer,
        deletions: this.deleteBuffer,
      }, context);
    }
    this.clearBuffer();
  }

  /**
   * clearBuffer discards any uncommitted insertions and deletions.
   * Used for error recovery after a failed SPARQL UPDATE.
   */
  public clearBuffer(): void {
    this.insertBuffer = [];
    this.deleteBuffer = [];
  }
}
