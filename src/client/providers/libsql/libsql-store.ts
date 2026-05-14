import type { Client, Row } from "@libsql/client";
import type * as rdfjs from "@rdfjs/types";
import { DataFactory } from "n3";
import { Readable } from "node:stream";
import { EventEmitter } from "node:events";
import type { LibsqlQueryBuilder } from "./libsql-query-builder.ts";
import type { Patch } from "#/client/quad-store/patch.ts";

const { namedNode, literal, blankNode, defaultGraph, quad } = DataFactory;

/**
 * FlushHandler is a callback that atomically persists a patch of buffered mutations.
 */
export type FlushHandler = (patch: Patch) => Promise<void>;

/**
 * LibsqlStore is a full RDF/JS Store implementation backed by LibSQL and hexastore covering indexes.
 * All triple/quad patterns resolve via a single SQL index seek with no in-memory hydration needed.
 */
export class LibsqlStore implements rdfjs.Store {
  /**
   * insertBuffer collects quads queued for insertion. Flushed atomically via flush().
   */
  private insertBuffer: rdfjs.Quad[] = [];

  /**
   * deleteBuffer collects quads queued for deletion. Flushed atomically via flush().
   */
  private deleteBuffer: rdfjs.Quad[] = [];

  public constructor(
    private readonly client: Client,
    private readonly queryBuilder: LibsqlQueryBuilder,
    private readonly flushHandler?: FlushHandler,
  ) {}

  /**
   * match returns a stream of quads matching the given SPOG pattern.
   * Automatically selects the optimal hexastore covering index based on
   * which pattern positions are bound.
   */
  public match(
    subject?: rdfjs.Term | null,
    predicate?: rdfjs.Term | null,
    object?: rdfjs.Term | null,
    graph?: rdfjs.Term | null,
  ): rdfjs.Stream<rdfjs.Quad> {
    const { sql, args } = this.buildMatchQuery({
      subject: subject ?? null,
      predicate: predicate ?? null,
      object: object ?? null,
      graph: graph ?? null,
    });

    const rowStream = new Readable({
      objectMode: true,
      read: async () => {
        try {
          const resultSet = await this.client.execute({ sql, args });
          for (const row of resultSet.rows) {
            const q = this.rowToQuad(row);
            rowStream.push(q);
          }
          rowStream.push(null);
        } catch (error) {
          rowStream.destroy(error as Error);
        }
      },
    });

    return rowStream as unknown as rdfjs.Stream<rdfjs.Quad>;
  }

  /**
   * add buffers a single quad for insertion on the next flush.
   */
  public add(quad: rdfjs.Quad): this {
    this.insertBuffer.push(quad);
    return this;
  }

  /**
   * delete buffers a single quad for deletion on the next flush.
   */
  public delete(quad: rdfjs.Quad): this {
    this.deleteBuffer.push(quad);
    return this;
  }

  /**
   * import consumes an RDF/JS Stream, buffering all quads for later flush.
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
   * remove consumes a stream and buffers all quads from it for deletion on flush.
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
   * removeMatches buffers all quads matching the given SPOG pattern for deletion on flush.
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
   * deleteGraph buffers all quads in the named graph for deletion on flush.
   */
  public deleteGraph(graph: rdfjs.Term | string): EventEmitter {
    const graphTerm = typeof graph === "string" ? namedNode(graph) : graph;
    return this.removeMatches(null, null, null, graphTerm);
  }

  /**
   * flush atomically persists all buffered insertions and deletions through
   * the configured FlushHandler. Deduplicates quads that appear in both
   * buffers before invoking the handler.
   */
  public async flush(): Promise<void> {
    this.deduplicateBuffers();
    if (this.insertBuffer.length === 0 && this.deleteBuffer.length === 0) {
      return;
    }
    if (this.flushHandler) {
      await this.flushHandler({
        insertions: this.insertBuffer,
        deletions: this.deleteBuffer,
      });
    }
    this.clearBuffer();
  }

  /**
   * deduplicateBuffers removes entries that appear in both insert and delete
   * buffers, since adding then deleting the same quad before flush should
   * be a semantic no-op.
   */
  private deduplicateBuffers(): void {
    const removeFromInsert: number[] = [];
    for (let i = this.insertBuffer.length - 1; i >= 0; i--) {
      for (let j = this.deleteBuffer.length - 1; j >= 0; j--) {
        if (this.insertBuffer[i].equals(this.deleteBuffer[j])) {
          removeFromInsert.push(i);
          this.deleteBuffer.splice(j, 1);
          break;
        }
      }
    }
    for (const idx of removeFromInsert) {
      this.insertBuffer.splice(idx, 1);
    }
  }

  /**
   * clearBuffer discards any unflushed insertions and deletions.
   * Used for error recovery after a failed SPARQL UPDATE.
   */
  public clearBuffer(): void {
    this.insertBuffer = [];
    this.deleteBuffer = [];
  }

  // ────────────────────────────────────────────────
  // Private helpers
  // ────────────────────────────────────────────────

  /**
   * buildMatchQuery constructs the optimal SQL query and parameters for a given SPOG pattern.
   * Selects the hexastore index with the longest prefix of bound columns.
   */
  private buildMatchQuery(pattern: {
    subject: rdfjs.Term | null;
    predicate: rdfjs.Term | null;
    object: rdfjs.Term | null;
    graph: rdfjs.Term | null;
  }): { sql: string; args: (string | null)[] } {
    const conditions: string[] = [];
    const args: (string | null)[] = [];

    this.appendTermCondition(conditions, args, "s", "s_type", pattern.subject);
    this.appendTermCondition(conditions, args, "o", "o_type", pattern.object);

    if (pattern.predicate) {
      conditions.push("p = ?");
      args.push(pattern.predicate.value);
    }

    this.appendTermCondition(conditions, args, "g", "g_type", pattern.graph);

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    return {
      sql:
        `SELECT id, s, s_type, p, o, o_type, o_datatype, o_lang, g, g_type FROM quads ${whereClause}`,
      args,
    };
  }

  /**
   * appendTermCondition adds WHERE clauses and args for a term that may be a NamedNode, BlankNode, or Literal.
   */
  private appendTermCondition(
    conditions: string[],
    args: (string | null)[],
    valueColumn: string,
    typeColumn: string,
    term: rdfjs.Term | null,
  ): void {
    if (!term) return;

    conditions.push(`${valueColumn} = ?`);
    args.push(term.value);

    conditions.push(`${typeColumn} = ?`);
    args.push(term.termType);

    if (term.termType === "Literal") {
      const lit = term as rdfjs.Literal;
      if (lit.language) {
        conditions.push(`o_lang = ?`);
        args.push(lit.language);
      }
      if (lit.datatype) {
        const dtValue = lit.datatype.value;
        if (dtValue !== "http://www.w3.org/2001/XMLSchema#string") {
          conditions.push(`o_datatype = ?`);
          args.push(dtValue);
        } else {
          conditions.push(`o_datatype IS NULL`);
        }
      }
    }
  }

  /**
   * rowToQuad reconstructs an RDF/JS Quad from a LibSQL result row.
   */
  private rowToQuad(row: Row): rdfjs.Quad {
    const subject = this.reconstructNonLiteral(
      String(row.s),
      String(row.s_type),
    );
    const predicate = namedNode(String(row.p));
    const object = this.reconstructObject(row);
    const graph = this.reconstructGraph(row);

    return quad(subject, predicate, object, graph);
  }

  /**
   * reconstructNonLiteral returns a NamedNode or BlankNode (never a Literal, since
   * Literals cannot appear in subject or graph positions in RDF 1.1).
   */
  private reconstructNonLiteral(
    value: string,
    type: string,
  ): rdfjs.NamedNode | rdfjs.BlankNode {
    if (type === "BlankNode") return blankNode(value);
    return namedNode(value);
  }

  private reconstructObject(row: Row): rdfjs.Quad_Object {
    const value = String(row.o);
    const type = String(row.o_type);

    if (type === "Literal") {
      const dt = row.o_datatype ? String(row.o_datatype) : undefined;
      const lang = row.o_lang ? String(row.o_lang) : undefined;

      if (lang && lang.trim().length > 0) {
        return literal(value, lang);
      }
      if (dt && dt !== "http://www.w3.org/2001/XMLSchema#string") {
        return literal(value, namedNode(dt));
      }
      return literal(value);
    }

    return this.reconstructNonLiteral(value, type);
  }

  private reconstructGraph(row: Row): rdfjs.Quad_Graph {
    const value = String(row.g);
    const type = String(row.g_type);

    if (type === "DefaultGraph") return defaultGraph();
    if (type === "BlankNode") return blankNode(value);
    return namedNode(value);
  }
}
