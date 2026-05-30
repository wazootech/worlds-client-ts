import type * as rdfjs from "@rdfjs/types";
import { DataFactory } from "n3";
import type { RdfFlatTerm } from "@/client/quad-store/rdf-flat-term.ts";
import {
  rdfTermFromFlatDescriptor,
  rdfTermToFlatDescriptor,
} from "@/client/quad-store/rdf-flat-term.ts";

const { quad } = DataFactory;

/** SerializedTerm is the Deno KV wire alias for a backend-neutral flat term descriptor. */
export type SerializedTerm = RdfFlatTerm;

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
  return rdfTermToFlatDescriptor(term);
}

/**
 * deserializeTerm reconstitutes a rich RDF/JS Term from a flat, persisted serialization.
 */
export function deserializeTerm(serializedTerm: SerializedTerm): rdfjs.Term {
  return rdfTermFromFlatDescriptor(serializedTerm);
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
