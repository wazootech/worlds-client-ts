import { createClient } from "@libsql/client";
import { ComunicaSparqlEngine } from "@worlds/client/adapters/comunica";
import {
  createLibsqlClient,
  createSubjectBoundPropertiesSparqlQuery,
} from "@worlds/client/adapters/libsql";
import { UniversalSentenceEncoderEmbeddingService } from "@worlds/client/adapters/tfjs-universal-sentence-encoder";
import { QueryEngine } from "@comunica/query-sparql-rdfjs-lite";
import { DataFactory } from "n3";

/** USE_LITE_VECTOR_DIMENSIONS is the embedding width for Universal Sentence Encoder lite. */
const USE_LITE_VECTOR_DIMENSIONS = 512;

const { quad, namedNode, literal } = DataFactory;

/** hasLocalUseModels is true when adapter-local USE artifacts are present on disk. */
function hasLocalUseModels(): boolean {
  const modelsDirectory = new URL(
    "../../src/client/adapters/tfjs-universal-sentence-encoder/models/",
    import.meta.url,
  );
  try {
    Deno.statSync(new URL("model.json", modelsDirectory));
    Deno.statSync(new URL("vocab.json", modelsDirectory));
    return true;
  } catch {
    return false;
  }
}

/**
 * This example demonstrates how to use `createLibsqlClient` with hybrid search:
 * LibSQL FTS5 keyword retrieval fused with vector similarity via USE lite embeddings.
 *
 * Prerequisites: run `deno task download:tfjs-use` once to cache model artifacts.
 *
 * It transparently handles:
 * 1. Automatic durable schema initialization (512-d vectors).
 * 2. Embedding-backed chunk indexing on import.
 * 3. Hybrid search and optional SPARQL over the same store.
 */
if (import.meta.main) {
  if (!hasLocalUseModels()) {
    console.error(
      "Local USE model artifacts not found. Run: deno task download:tfjs-use",
    );
    Deno.exit(1);
  }

  console.log("Initializing durable LibSQL context...");
  const databaseClient = createClient({ url: ":memory:" });
  const queryEngine = new QueryEngine();
  const embeddingService = new UniversalSentenceEncoderEmbeddingService();

  console.log("Provisioning LibSQL client with USE embedding service...");
  const client = await createLibsqlClient({
    client: databaseClient,
    embeddingService,
    vectorDimensions: USE_LITE_VECTOR_DIMENSIONS,
    createSparqlEngine: ({ libsqlStore }) =>
      new ComunicaSparqlEngine({ queryEngine, store: libsqlStore }),
  });
  console.log("Gateway operational.");

  console.log("\nIngesting semantically distinct quads...");
  await client.import({
    source: {
      kind: "quads",
      quads: [
        quad(
          namedNode("urn:animal:cat"),
          namedNode("urn:description"),
          literal("The curious cat explores the sunny garden."),
        ),
        quad(
          namedNode("urn:physics:quantum"),
          namedNode("urn:description"),
          literal(
            "Quantum mechanics describes subatomic particle behavior in physics.",
          ),
        ),
      ],
    },
    mode: "merge",
  });

  console.log("\nExecuting hybrid search (vector + keyword)...");
  const searchResponse = await client.search({
    query: "cat in the garden",
  });
  console.log(JSON.stringify(searchResponse, null, 2));

  const topResult = searchResponse.results?.[0];
  if (topResult?.subject !== "urn:animal:cat") {
    console.error(
      "Expected urn:animal:cat as top semantic match, got:",
      topResult?.subject,
    );
    Deno.exit(1);
  }
  console.log("\nTop match is the garden/cat quad (hybrid vector search OK).");

  console.log("\nExecuting subject-bound SPARQL query...");
  const sparqlResponse = await client.sparql({
    query: createSubjectBoundPropertiesSparqlQuery("urn:animal:cat"),
  });
  console.log(JSON.stringify(sparqlResponse, null, 2));
}
