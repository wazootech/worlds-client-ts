import { assertEquals } from "@std/assert";
import { createClient } from "@libsql/client";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { DataFactory, Store } from "n3";
import { QueryEngine } from "@comunica/query-sparql-rdfjs-lite";
import {
  commitPatchToLibsql,
  initializeLibsqlSchema,
  LibsqlQueryBuilder,
  LibsqlStore,
} from "@/client/adapters/libsql/mod.ts";
import {
  createComunicaLibsqlSparqlEngineFactory,
  createComunicaSparqlEngineFactory,
} from "./create-comunica-sparql-engine-factory.ts";

const queryEngine = new QueryEngine();

Deno.test(
  "createComunicaSparqlEngineFactory - executes SELECT against an `store` context",
  async () => {
    const store = new Store();
    store.addQuad(
      DataFactory.namedNode("https://example.com/s"),
      DataFactory.namedNode("https://example.com/p"),
      DataFactory.literal("factory-value"),
    );

    const createSparqlEngine = createComunicaSparqlEngineFactory({
      queryEngine,
    });
    const sparqlEngine = createSparqlEngine({ store });
    const response = await sparqlEngine.execute({
      query:
        "SELECT ?object WHERE { <https://example.com/s> <https://example.com/p> ?object }",
    });

    if (response.kind !== "select") {
      throw new Error("Expected select response kind");
    }

    assertEquals(
      response.data.results.bindings[0]?.object?.value,
      "factory-value",
    );
  },
);

Deno.test(
  "createComunicaLibsqlSparqlEngineFactory - executes SELECT against a `libsqlStore` context",
  async () => {
    const databaseClient = createClient({ url: ":memory:" });
    const libsqlQueryBuilder = new LibsqlQueryBuilder(32);
    await initializeLibsqlSchema(databaseClient, libsqlQueryBuilder);

    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
    });
    const libsqlStore = new LibsqlStore({
      client: databaseClient,
      queryBuilder: libsqlQueryBuilder,
      commitHandler: async (patch) => {
        await commitPatchToLibsql(patch, {
          client: databaseClient,
          textSplitter,
          libsqlQueryBuilder,
          skipSearchIndexProjection: true,
        });
      },
    });

    const subjectIri = "urn:factory:entity:0";
    libsqlStore.addQuad(
      DataFactory.quad(
        DataFactory.namedNode(subjectIri),
        DataFactory.namedNode("urn:factory:predicate"),
        DataFactory.literal("libsql-factory-value"),
      ),
    );
    await libsqlStore.commit();

    const createSparqlEngine = createComunicaLibsqlSparqlEngineFactory({
      queryEngine,
    });
    const sparqlEngine = createSparqlEngine({ libsqlStore });
    const response = await sparqlEngine.execute({
      query: `SELECT ?object WHERE { <${subjectIri}> ?property ?object }`,
    });

    if (response.kind !== "select") {
      throw new Error("Expected select response kind");
    }

    assertEquals(
      response.data.results.bindings[0]?.object?.value,
      "libsql-factory-value",
    );
  },
);
