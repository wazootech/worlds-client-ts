import type * as rdfjs from "@rdfjs/types";
import { DataFactory } from "n3";

const { namedNode, blankNode, literal, defaultGraph, quad } = DataFactory;

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
 * serializeTerm flattens an RDF/JS term for Deno KV persistence.
 */
export function serializeTerm(term: rdfjs.Term): SerializedTerm {
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
export function deserializeTerm(serializedTerm: SerializedTerm): rdfjs.Term {
  switch (serializedTerm.termType) {
    case "NamedNode":
      return namedNode(serializedTerm.value);
    case "BlankNode":
      return blankNode(serializedTerm.value);
    case "Literal":
      if (serializedTerm.language) {
        return literal(serializedTerm.value, serializedTerm.language);
      }
      if (serializedTerm.datatype) {
        return literal(
          serializedTerm.value,
          namedNode(serializedTerm.datatype),
        );
      }
      return literal(serializedTerm.value);
    case "DefaultGraph":
      return defaultGraph();
    default:
      throw new Error(`Unsupported term type: ${serializedTerm.termType}`);
  }
}

/**
 * deserializeQuad reconstitutes an RDF/JS quad from a persisted serialization.
 */
export function deserializeQuad(serializedQuad: SerializedQuad): rdfjs.Quad {
  return quad(
    deserializeTerm(serializedQuad.subject) as rdfjs.Quad_Subject,
    deserializeTerm(serializedQuad.predicate) as rdfjs.Quad_Predicate,
    deserializeTerm(serializedQuad.object) as rdfjs.Quad_Object,
    deserializeTerm(serializedQuad.graph) as rdfjs.Quad_Graph,
  );
}
