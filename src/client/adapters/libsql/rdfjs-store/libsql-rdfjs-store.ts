import type { Client } from "@libsql/client";
import type * as rdfjs from "@rdfjs/types";
import { Readable } from "node:stream";
import type { EventEmitter } from "node:events";
import type { LibsqlQueryBuilder } from "./sql/libsql-query-builder.ts";
import { DEFAULT_LIBSQL_MATCH_PAGE_SIZE } from "./sql/libsql-query-builder.ts";
import type {
  CommitHandler,
  PatchCommitContext,
} from "@/client/quad-store/mod.ts";
import type { ImportLifecycle } from "@/client/import-lifecycle/mod.ts";
import {
  commitBufferedPatch,
  RdfjsPatchBuffer,
} from "@/client/rdfjs-buffer/mod.ts";
import { quadFromLibsqlRow } from "./sql/libsql-quad-row.ts";

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

  /** importLifecycle runs around import commits when PatchCommitContext.importMode is set. */
  importLifecycle?: ImportLifecycle;

  /** matchPageSize limits rows per hexastore match SQL round-trip (default 1000). */
  matchPageSize?: number;
}

/**
 * LibsqlRdfjsStore is a full RDF/JS Store implementation backed by LibSQL and hexastore covering indexes.
 * All triple/quad patterns resolve via a single SQL index seek with no in-memory hydration needed.
 */
export class LibsqlRdfjsStore implements rdfjs.Store {
  private readonly patchBuffer = new RdfjsPatchBuffer();

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
    this.patchBuffer.add(quad);
    return this;
  }

  /**
   * addQuad buffers a single quad for insertion on the next commit (RDF/JS Store alias for add).
   */
  public addQuad(quad: rdfjs.Quad): this {
    this.patchBuffer.addQuad(quad);
    return this;
  }

  /**
   * delete buffers a single quad for deletion on the next commit.
   */
  public delete(quad: rdfjs.Quad): this {
    this.patchBuffer.delete(quad);
    return this;
  }

  /**
   * import consumes an RDF/JS Stream, buffering all quads for later commit.
   */
  public import(stream: rdfjs.Stream<rdfjs.Quad>): EventEmitter {
    return this.patchBuffer.import(stream);
  }

  /**
   * remove consumes a stream and buffers all quads from it for deletion on commit.
   */
  public remove(stream: rdfjs.Stream<rdfjs.Quad>): EventEmitter {
    return this.patchBuffer.remove(stream);
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
    return this.patchBuffer.removeMatches(
      this.match.bind(this),
      subject,
      predicate,
      object,
      graph,
    );
  }

  /**
   * deleteGraph buffers all quads in the named graph for deletion on commit.
   */
  public deleteGraph(graph: rdfjs.Term | string): EventEmitter {
    return this.patchBuffer.deleteGraph(this.match.bind(this), graph);
  }

  /**
   * commit atomically persists all buffered insertions and deletions through
   * the configured CommitHandler. Deduplicates quads that appear in both
   * buffers before invoking the handler.
   */
  public async commit(context?: PatchCommitContext): Promise<void> {
    await commitBufferedPatch(this.patchBuffer, {
      commitHandler: this.options.commitHandler,
      context,
      importLifecycle: this.options.importLifecycle,
    });
  }

  /**
   * clearBuffer discards any uncommitted insertions and deletions.
   * Used for error recovery after a failed SPARQL UPDATE.
   */
  public clearBuffer(): void {
    this.patchBuffer.clearBuffer();
  }
}
