import type * as rdfjs from "@rdfjs/types";

/** rdfLangStringIri is the RDF datatype for language-tagged literals in N3/RDF/JS. */
const rdfLangStringIri =
  "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString";

/** xsdStringIri is the XSD string datatype IRI. */
const xsdStringIri = "http://www.w3.org/2001/XMLSchema#string";

/**
 * LibsqlSpogPattern holds optional bound RDF/JS terms for hexastore quad pattern matching.
 */
export interface LibsqlSpogPattern {
  /** subject is the optional bound subject term. */
  subject: rdfjs.Term | null;
  /** predicate is the optional bound predicate term. */
  predicate: rdfjs.Term | null;
  /** object is the optional bound object term. */
  object: rdfjs.Term | null;
  /** graph is the optional bound graph term. */
  graph: rdfjs.Term | null;
}

/**
 * LibsqlSpogWhereClause is the SQL fragment and bound args for a quad pattern filter.
 */
export interface LibsqlSpogWhereClause {
  /** conditions are AND-joined predicates without a leading WHERE. */
  conditions: string[];
  /** args are bound parameters in statement order. */
  args: (string | null)[];
}

/**
 * buildLibsqlSpogWhereClause constructs WHERE conditions and args for a hexastore SPOG pattern.
 */
export function buildLibsqlSpogWhereClause(
  pattern: LibsqlSpogPattern,
): LibsqlSpogWhereClause {
  const conditions: string[] = [];
  const args: (string | null)[] = [];

  appendTermCondition(conditions, args, "s", "s_type", pattern.subject);
  appendTermCondition(conditions, args, "o", "o_type", pattern.object);

  if (pattern.predicate) {
    conditions.push("p = ?");
    args.push(pattern.predicate.value);
  }

  appendTermCondition(conditions, args, "g", "g_type", pattern.graph);

  return { conditions, args };
}

/**
 * appendTermCondition adds WHERE clauses and args for a term that may be a NamedNode, BlankNode, or Literal.
 */
function appendTermCondition(
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
    const literalTerm = term as rdfjs.Literal;
    if (literalTerm.language) {
      conditions.push(`o_lang = ?`);
      args.push(literalTerm.language);
    }
    if (literalTerm.datatype) {
      const datatypeValue = literalTerm.datatype.value;
      if (
        datatypeValue === xsdStringIri ||
        datatypeValue === rdfLangStringIri
      ) {
        conditions.push(`o_datatype IS NULL`);
      } else {
        conditions.push(`o_datatype = ?`);
        args.push(datatypeValue);
      }
    }
  }
}
