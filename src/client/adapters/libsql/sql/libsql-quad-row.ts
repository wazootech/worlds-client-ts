import type { Row } from "@libsql/client";
import type * as rdfjs from "@rdfjs/types";
import { DataFactory } from "n3";
import { rdfTermFromFlatDescriptor } from "@/client/quad-store/rdf-flat-term.ts";

const { quad } = DataFactory;

/**
 * quadFromLibsqlRow reconstructs an RDF/JS quad from a LibSQL `quads` table row.
 */
export function quadFromLibsqlRow(row: Row): rdfjs.Quad {
  const subject = rdfTermFromFlatDescriptor({
    termType: String(row.s_type),
    value: String(row.s),
  }) as rdfjs.Quad_Subject;
  const predicate = rdfTermFromFlatDescriptor({
    termType: "NamedNode",
    value: String(row.p),
  }) as rdfjs.Quad_Predicate;
  const object = rdfTermFromFlatDescriptor({
    termType: String(row.o_type),
    value: String(row.o),
    language: row.o_lang ? String(row.o_lang) : undefined,
    datatype: row.o_datatype ? String(row.o_datatype) : undefined,
  }) as rdfjs.Quad_Object;
  const graph = rdfTermFromFlatDescriptor({
    termType: String(row.g_type),
    value: String(row.g),
  }) as rdfjs.Quad_Graph;

  return quad(subject, predicate, object, graph);
}
