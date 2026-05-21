import type * as rdfjs from "@rdfjs/types";
import { DataFactory, Parser, Writer } from "n3";
import type {
  ExportRequest,
  ExportResponse,
  ImportRequest,
  ImportResponse,
  QuadStoreInterface,
} from "@worlds/client";
import { hashQuad } from "@worlds/client";

const { namedNode, blankNode, literal, defaultGraph, quad } = DataFactory;

/**
 * DenokvQuadStoreOptions specifies the configuration for the Deno Kv provider.
 */
export interface DenokvQuadStoreOptions {
  /** kv is the underlying Deno Kv database instance. */
  kv: Deno.Kv;

  /** keyPrefix is the namespace prefix for stored quads to avoid key collisions. Defaults to ["quads"]. */
  keyPrefix?: Deno.KvKey;
}

/** SerializedTerm represents a flat V8-serializable descriptor of an RDF Term. */
export interface SerializedTerm {
  termType: string;
  value: string;
  language?: string;
  datatype?: string;
}

/** SerializedQuad bundles four serialized terms representing an RDF quad. */
export interface SerializedQuad {
  subject: SerializedTerm;
  predicate: SerializedTerm;
  object: SerializedTerm;
  graph: SerializedTerm;
}

/**
 * DenokvQuadStore provides persistent storage of RDF quads using Deno Kv.
 */
export class DenokvQuadStore implements QuadStoreInterface {
  public constructor(
    private readonly options: DenokvQuadStoreOptions,
  ) {}

  public async import(request: ImportRequest): Promise<ImportResponse> {
    const mode = request.mode ?? "merge";
    const keyPrefix = this.options.keyPrefix ?? ["quads"];

    if (mode === "replace") {
      const iter = this.options.kv.list({ prefix: keyPrefix });
      let atomic = this.options.kv.atomic();
      let count = 0;
      for await (const entry of iter) {
        atomic.delete(entry.key);
        count++;
        if (count >= MAX_KV_BATCH_SIZE) {
          await atomic.commit();
          atomic = this.options.kv.atomic();
          count = 0;
        }
      }
      if (count > 0) {
        await atomic.commit();
      }
    }

    let quadsToImport: Iterable<rdfjs.Quad> = [];
    if (request.source.kind === "quads") {
      quadsToImport = request.source.quads;
    } else if (request.source.kind === "dataset") {
      quadsToImport = request.source.dataset;
    } else if (request.source.kind === "serialized") {
      const { n3Format } = getFormat(request.source.contentType);
      const parser = new Parser({ format: n3Format });
      quadsToImport = parser.parse(request.source.data);
    } else {
      throw new Error("Unsupported import source kind");
    }

    let atomic = this.options.kv.atomic();
    let count = 0;
    for (const q of quadsToImport) {
      const hash = await hashQuad(q);
      const key = [...keyPrefix, hash];
      const val: SerializedQuad = {
        subject: serializeTerm(q.subject),
        predicate: serializeTerm(q.predicate),
        object: serializeTerm(q.object),
        graph: serializeTerm(q.graph),
      };
      atomic.set(key, val);
      count++;
      if (count >= MAX_KV_BATCH_SIZE) {
        await atomic.commit();
        atomic = this.options.kv.atomic();
        count = 0;
      }
    }
    if (count > 0) {
      await atomic.commit();
    }
  }

  public async export(request: ExportRequest): Promise<ExportResponse> {
    const keyPrefix = this.options.keyPrefix ?? ["quads"];
    const quads: rdfjs.Quad[] = [];
    const iter = this.options.kv.list<SerializedQuad>({ prefix: keyPrefix });
    for await (const entry of iter) {
      const sq = entry.value;
      quads.push(
        quad(
          deserializeTerm(sq.subject) as rdfjs.Quad_Subject,
          deserializeTerm(sq.predicate) as rdfjs.Quad_Predicate,
          deserializeTerm(sq.object) as rdfjs.Quad_Object,
          deserializeTerm(sq.graph) as rdfjs.Quad_Graph,
        ),
      );
    }

    if (request.format.kind === "quads") {
      return { kind: "quads", quads };
    }

    if (request.format.kind === "serialized") {
      const contentType = request.format.contentType ?? "application/n-quads";
      const { n3Format } = getFormat(contentType);

      const writer = new Writer({ format: n3Format });
      for (const q of quads) {
        writer.addQuad(q);
      }

      const data = await new Promise<string>((resolve, reject) => {
        writer.end((error: Error | null, result?: string) => {
          if (error) reject(error);
          else resolve(result ?? "");
        });
      });

      return { kind: "serialized", data, contentType };
    }

    throw new Error(`Unsupported export format`);
  }
}

const MAX_KV_BATCH_SIZE = 50;

function serializeTerm(term: rdfjs.Term): SerializedTerm {
  return {
    termType: term.termType,
    value: term.value,
    language: term.termType === "Literal"
      ? (term as rdfjs.Literal).language
      : undefined,
    datatype: term.termType === "Literal"
      ? (term as rdfjs.Literal).datatype.value
      : undefined,
  };
}

/**
 * deserializeTerm reconstitutes a rich RDF/JS Term from a flat, persisted serialization.
 */
export function deserializeTerm(t: SerializedTerm): rdfjs.Term {
  switch (t.termType) {
    case "NamedNode":
      return namedNode(t.value);
    case "BlankNode":
      return blankNode(t.value);
    case "Literal":
      if (t.datatype) {
        return literal(t.value, namedNode(t.datatype));
      }
      if (t.language) {
        return literal(t.value, t.language);
      }
      return literal(t.value);
    case "DefaultGraph":
      return defaultGraph();
    default:
      throw new Error(`Unsupported term type: ${t.termType}`);
  }
}

/**
 * RdfFormat specifies content type configuration mapping for parser/writer facilities.
 */
export interface RdfFormat {
  contentType: string;
  n3Format: string;
}

/**
 * FORMATS is a map of content types to supported RdfFormats.
 */
export const FORMATS: Record<string, RdfFormat> = {
  "text/turtle": { contentType: "text/turtle", n3Format: "Turtle" },
  "application/n-quads": {
    contentType: "application/n-quads",
    n3Format: "N-Quads",
  },
  "application/n-triples": {
    contentType: "application/n-triples",
    n3Format: "N-Triples",
  },
  "text/n3": { contentType: "text/n3", n3Format: "N3" },
};

/**
 * getFormat resolves the appropriate RdfFormat mapping for the given content type, defaulting to N-Quads.
 */
export function getFormat(contentType: string | undefined): RdfFormat {
  const format = contentType?.toLowerCase() || "application/n-quads";
  return FORMATS[format] || FORMATS["application/n-quads"];
}
