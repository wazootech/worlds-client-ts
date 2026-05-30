import type * as rdfjs from "@rdfjs/types";
import { DataFactory } from "n3";

const { namedNode, blankNode, literal, defaultGraph } = DataFactory;

const XSD_STRING = "http://www.w3.org/2001/XMLSchema#string";

/** RdfFlatTerm is the backend-neutral flat descriptor for one RDF/JS term. */
export interface RdfFlatTerm {
  /** termType is the RDF/JS term type discriminator. */
  termType: string;

  /** value is the lexical or IRI value for the term. */
  value: string;

  /** language is the optional language tag for Literal terms. */
  language?: string;

  /** datatype is the optional datatype IRI for Literal terms. */
  datatype?: string;
}

/**
 * rdfTermToFlatDescriptor flattens an RDF/JS term into a backend-neutral descriptor.
 */
export function rdfTermToFlatDescriptor(term: rdfjs.Term): RdfFlatTerm {
  if (term.termType === "Literal") {
    const literalTerm = term as rdfjs.Literal;
    return {
      termType: term.termType,
      value: term.value,
      language: literalTerm.language || undefined,
      datatype: literalTerm.datatype?.value || undefined,
    };
  }

  return {
    termType: term.termType,
    value: term.value,
  };
}

/**
 * rdfTermFromFlatDescriptor reconstitutes an RDF/JS term from a flat descriptor.
 */
export function rdfTermFromFlatDescriptor(descriptor: RdfFlatTerm): rdfjs.Term {
  switch (descriptor.termType) {
    case "NamedNode":
      return namedNode(descriptor.value);
    case "BlankNode":
      return blankNode(descriptor.value);
    case "Literal": {
      if (descriptor.language && descriptor.language.trim().length > 0) {
        return literal(descriptor.value, descriptor.language);
      }
      if (descriptor.datatype && descriptor.datatype !== XSD_STRING) {
        return literal(descriptor.value, namedNode(descriptor.datatype));
      }
      return literal(descriptor.value);
    }
    case "DefaultGraph":
      return defaultGraph();
    default:
      throw new Error(`Unsupported term type: ${descriptor.termType}`);
  }
}
