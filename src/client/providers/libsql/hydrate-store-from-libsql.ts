import type { Client, Row } from "@libsql/client";
import { DataFactory, type Store } from "n3";
import type * as rdfjs from "@rdfjs/types";
import type { QuadFilter } from "#/client/quad-store/quad-filter.ts";
import { defaultLibsqlQueryBuilder } from "./libsql-query-builder.ts";

const { namedNode, literal, blankNode, defaultGraph, quad } = DataFactory;

/**
 * hydrateStoreFromLibsql reconstructs full in-memory state at lightning speeds by deserializing
 * relational tuples directly into Graph nodes, avoiding costly string parsing compute overhead.
 */
export async function hydrateStoreFromLibsql(
  client: Client,
  target: Store,
  filter?: QuadFilter,
): Promise<number> {
  const query = defaultLibsqlQueryBuilder.buildHydrateQuery(filter);
  const resultSet = await client.execute(query);

  if (!resultSet.rows.length) return 0;

  const batchQuads: rdfjs.Quad[] = [];
  for (const row of resultSet.rows) {
    try {
      const subject = reconstructSubject(row);
      const predicate = namedNode(String(row.p));
      const object = reconstructObject(row);
      const graph = reconstructGraph(row);

      batchQuads.push(quad(subject, predicate, object, graph));
    } catch (err) {
      console.warn(
        `hydrateStoreFromLibsql: skipping corrupt row s="${row.s}"`,
        err,
      );
    }
  }

  if (batchQuads.length > 0) {
    target.addQuads(batchQuads);
  }

  return batchQuads.length;
}

function reconstructSubject(row: Row): rdfjs.Quad_Subject {
  const type = String(row.s_type);
  const val = String(row.s);
  if (type === "BlankNode") return blankNode(val);
  return namedNode(val);
}

function reconstructObject(row: Row): rdfjs.Quad_Object {
  const type = String(row.o_type);
  const val = String(row.o);

  if (type === "Literal") {
    const dt = row.o_datatype ? String(row.o_datatype) : undefined;
    const lang = row.o_lang ? String(row.o_lang) : undefined;

    if (lang && lang.trim().length > 0) {
      return literal(val, lang);
    }
    if (dt && dt !== "http://www.w3.org/2001/XMLSchema#string") {
      return literal(val, namedNode(dt));
    }
    return literal(val);
  }

  if (type === "BlankNode") return blankNode(val);
  return namedNode(val);
}

function reconstructGraph(row: Row): rdfjs.Quad_Graph {
  const type = String(row.g_type);
  const val = String(row.g);

  if (type === "DefaultGraph") return defaultGraph();
  if (type === "BlankNode") return blankNode(val);
  return namedNode(val);
}
