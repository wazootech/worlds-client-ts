import type * as rdfjs from "@rdfjs/types";
import type { QueryEngine } from "@comunica/query-sparql-rdfjs-lite";
import type {
  SparqlAskResults,
  SparqlBinding,
  SparqlEngineInterface,
  SparqlRequest,
  SparqlResponse,
  SparqlSelectResults,
  SparqlValue,
} from "#/client/sparql-engine/sparql-engine-interface.ts";

/**
 * ComunicaSparqlEngineOptions are the options for ComunicaSparqlEngine.
 */
export interface ComunicaSparqlEngineOptions {
  /**
   * store is the RDFJS store to execute the query on.
   */
  store: rdfjs.Store;

  /**
   * queryEngine is the Comunica query engine to use.
   */
  queryEngine: QueryEngine;
}

/**
 * ComunicaSparqlEngine is the standard implementation of SparqlEngineInterface
 * that uses the Comunica engine over a local RDFJS store.
 */
export class ComunicaSparqlEngine implements SparqlEngineInterface {
  constructor(private readonly options: ComunicaSparqlEngineOptions) {}

  public async execute(request: SparqlRequest): Promise<SparqlResponse> {
    return await executeSparql(
      this.options.queryEngine,
      this.options.store,
      request,
    );
  }
}

/** Default timeout for SPARQL queries (30 seconds). */
const DEFAULT_SPARQL_TIMEOUT_MS = 30_000;

/**
 * executeSparql executes a SPARQL query on an RDFJS Store.
 *
 * @param store The RDFJS Store to execute the query on.
 * @param request The SPARQL query request.
 * @returns The SPARQL query response.
 */
export async function executeSparql(
  queryEngine: QueryEngine,
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
      baseIRI: request.baseIri,
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
          // TODO: Implement "quads" case to drain result stream and resolve as { kind: "construct", data: rdfjs.Quad[] }
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
