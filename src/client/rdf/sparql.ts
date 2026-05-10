import type * as rdfjs from "@rdfjs/types";
import { QueryEngine } from "@comunica/query-sparql-rdfjs-lite";

export interface SparqlRequest {
  /** The raw SPARQL query string. */
  query: string;

  /** Base IRI for the query. */
  baseIRI?: string;

  /** Query timeout in milliseconds (defaults to 30 seconds). */
  timeoutMs?: number;
}

export type SparqlResponse =
  | { kind: "select"; data: SparqlSelectResults }
  | { kind: "ask"; data: SparqlAskResults }
  | { kind: "void" };

export type SparqlAskResults = {
  head: {
    link?: Array<string> | null;
  };
  boolean: boolean;
};

export type SparqlSelectResults = {
  head: {
    vars: Array<string>;
    link?: Array<string> | null;
  };
  results: {
    bindings: Array<SparqlBinding>;
  };
};

/**
 * A value in a SPARQL binding (JSON-SPARQL shape).
 */
export type SparqlValue =
  | { type: "uri"; value: string }
  | { type: "bnode"; value: string }
  | {
    type: "literal";
    value: string;
    "xml:lang"?: string;
    datatype?: string;
  }
  | {
    type: "triple";
    value: {
      subject: SparqlValue;
      predicate: SparqlValue;
      object: SparqlValue;
    };
  };

export type SparqlBinding = Record<string, SparqlValue>;

/** Default timeout for SPARQL queries (30 seconds). */
const DEFAULT_SPARQL_TIMEOUT_MS = 30_000;

/**
 * queryEngine is a singleton instance of the Comunica QueryEngine.
 */
export const queryEngine: QueryEngine = new QueryEngine();

/**
 * Executes a SPARQL query on an in-memory Store.
 * Supported: SELECT (bindings), ASK (boolean), UPDATE (void).
 */
export async function applySparql(
  store: rdfjs.Store,
  request: SparqlRequest,
): Promise<SparqlResponse> {
  const timeoutMs = request.timeoutMs ?? DEFAULT_SPARQL_TIMEOUT_MS;

  return await new Promise((resolve, reject) => {
    let timer: number | undefined = undefined;

    const clearTimer = () => {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    };

    timer = setTimeout(() => {
      clearTimer();
      reject(new Error("SPARQL query timed out"));
    }, timeoutMs);

    queryEngine.query(request.query, {
      sources: [store],
      baseIRI: request.baseIRI,
    }).then(async (queryType) => {
      clearTimer();

      try {
        switch (queryType.resultType) {
          case "void": {
            // Note: resultType 'void' indicates an Update operation complete
            await queryType.execute();
            return resolve({ kind: "void" });
          }
          case "bindings": {
            const results = await handleBindings(
              queryType as Parameters<typeof handleBindings>[0],
            );
            return resolve({ kind: "select", data: results });
          }
          case "boolean": {
            const results = await handleBoolean(
              queryType as Parameters<typeof handleBoolean>[0],
            );
            return resolve({ kind: "ask", data: results });
          }
          default:
            return reject(
              new Error(
                `Query result type '${queryType.resultType}' (e.g. CONSTRUCT/DESCRIBE) is not supported currently`,
              ),
            );
        }
      } catch (err) {
        reject(err);
      }
    }).catch((err) => {
      clearTimer();
      reject(err);
    });
  });
}

async function handleBindings(queryType: {
  // deno-lint-ignore no-explicit-any
  execute(): Promise<rdfjs.Stream<any>>;
  metadata(): Promise<{ variables: rdfjs.Variable[] }>;
}): Promise<SparqlSelectResults> {
  const bindingsStream = await queryType.execute();
  const vars = (await queryType.metadata()).variables.map((v) => v.value);

  const bindings = await new Promise<SparqlBinding[]>((resolve, reject) => {
    const b: SparqlBinding[] = [];
    let finished = false;

    // The incoming bindings from Comunica implement internal get() logic
    // deno-lint-ignore no-explicit-any
    const onData = (binding: any) => {
      if (finished) return;
      const bindingObj: SparqlBinding = {};
      for (const v of vars) {
        const term = binding.get ? binding.get(v) : binding[v];
        if (term) {
          bindingObj[v] = toSparqlValue(term);
        }
      }
      b.push(bindingObj);
    };

    const onEnd = () => {
      if (!finished) {
        finished = true;
        resolve(b);
      }
    };

    const onError = (err: unknown) => {
      if (!finished) {
        finished = true;
        reject(err);
      }
    };

    bindingsStream.on("data", onData);
    bindingsStream.on("end", onEnd);
    bindingsStream.on("error", onError);
  });

  return {
    head: { vars, link: undefined },
    results: { bindings },
  };
}

async function handleBoolean(queryType: {
  execute(): Promise<boolean>;
}): Promise<SparqlAskResults> {
  const boolean = await queryType.execute();
  return {
    head: { link: undefined },
    boolean,
  };
}

// deno-lint-ignore no-explicit-any
function toSparqlValue(term: any): SparqlValue {
  const type = term.termType;
  const value = term.value;

  if (type === "NamedNode") {
    return { type: "uri", value };
  }
  if (type === "BlankNode") {
    return { type: "bnode", value };
  }

  const val: SparqlValue = {
    type: "literal",
    value,
  };

  if (term.language) {
    val["xml:lang"] = term.language;
  }

  if (
    term.datatype &&
    term.datatype.value !== "http://www.w3.org/2001/XMLSchema#string"
  ) {
    val.datatype = term.datatype.value;
  }

  return val;
}
