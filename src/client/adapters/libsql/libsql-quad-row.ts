import type { Row } from "@libsql/client";
import type * as rdfjs from "@rdfjs/types";
import { DataFactory } from "n3";

const { namedNode, literal, blankNode, defaultGraph, quad } = DataFactory;

/**
 * quadFromLibsqlRow reconstructs an RDF/JS quad from a LibSQL `quads` table row.
 */
export function quadFromLibsqlRow(row: Row): rdfjs.Quad {
  const subject = reconstructSubject(row);
  const predicate = namedNode(String(row.p));
  const object = reconstructObject(row);
  const graph = reconstructGraph(row);
  return quad(subject, predicate, object, graph);
}

function reconstructSubject(row: Row): rdfjs.Quad_Subject {
  const type = String(row.s_type);
  const value = String(row.s);
  if (type === "BlankNode") return blankNode(value);
  return namedNode(value);
}

function reconstructObject(row: Row): rdfjs.Quad_Object {
  const type = String(row.o_type);
  const value = String(row.o);

  if (type === "Literal") {
    const datatype = row.o_datatype ? String(row.o_datatype) : undefined;
    const language = row.o_lang ? String(row.o_lang) : undefined;

    if (language && language.trim().length > 0) {
      return literal(value, language);
    }
    if (datatype && datatype !== "http://www.w3.org/2001/XMLSchema#string") {
      return literal(value, namedNode(datatype));
    }
    return literal(value);
  }

  if (type === "BlankNode") return blankNode(value);
  return namedNode(value);
}

function reconstructGraph(row: Row): rdfjs.Quad_Graph {
  const type = String(row.g_type);
  const value = String(row.g);

  if (type === "DefaultGraph") return defaultGraph();
  if (type === "BlankNode") return blankNode(value);
  return namedNode(value);
}
