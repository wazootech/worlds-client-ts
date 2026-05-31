import { createClient } from "@libsql/client";
import { createLibsqlClient } from "@worlds/client/adapters/libsql";
import { UniversalSentenceEncoderEmbeddingService } from "@worlds/client/adapters/tfjs-universal-sentence-encoder";
import { QueryEngine } from "@comunica/query-sparql-rdfjs-lite";
import { DataFactory } from "n3";

/** USE_LITE_VECTOR_DIMENSIONS is the embedding width for Universal Sentence Encoder lite. */
const USE_LITE_VECTOR_DIMENSIONS = 512;

const { quad, namedNode, literal } = DataFactory;

/** exampleSubjectIri is the grounded subject used for production-style SPARQL in this demo. */
const exampleSubjectIri = "urn:demo:entity:0";

/**
 * hasLocalUseModels returns true when adapter-local USE artifacts are present on disk.
 */
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
 * Main entry point for the consolidated LibSQL hello-world example.
 *
 * Demonstrates a production-style, long-running service configuration with a single process-scoped Client:
 * 1. Durable schema initialization on LibSQL (hexastore index + FTS5 + USE vector embeddings).
 * 2. Ingestion of semantically distinct and metadata quads.
 * 3. Fused hybrid search (vector similarity + keyword FTS5) via TF.js Universal Sentence Encoder models.
 * 4. Grounded, subject-bound selective SPARQL query optimized for scale.
 * 5. Capped full-scan SPARQL query illustrating unbound scans (for debugging/development only).
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

  console.log("Provisioning hexastore client (process lifetime)...");
  const client = await createLibsqlClient({
    client: databaseClient,
    embeddingService,
    vectorDimensions: USE_LITE_VECTOR_DIMENSIONS,
    queryEngine,
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
        quad(
          namedNode(exampleSubjectIri),
          namedNode("urn:demo:predicate"),
          literal("Production paths bind at least one term in hot-path BGPs."),
        ),
        quad(
          namedNode("urn:demo:entity:1"),
          namedNode("urn:demo:predicate"),
          literal(
            "Other entities stay reachable via bound lookups, not full scans.",
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

  console.log("\n--- SPARQL AT SCALE DEMONSTRATION ---");

  const selectiveSparqlQuery =
    `SELECT ?property ?object WHERE { <${exampleSubjectIri}> ?property ?object }`;
  console.log(
    "Selective (production-style / scale-safe):",
    selectiveSparqlQuery,
  );
  const selectiveResponse = await client.sparql({
    query: selectiveSparqlQuery,
  });
  console.log(JSON.stringify(selectiveResponse, null, 2));

  const devOnlyScanQuery =
    "SELECT ?subject ?property ?object WHERE { ?subject ?property ?object } LIMIT 100";
  console.log("\nCapped full scan (dev/small graphs only):", devOnlyScanQuery);
  const scanResponse = await client.sparql({ query: devOnlyScanQuery });
  console.log(JSON.stringify(scanResponse, null, 2));

  console.log("\nLibSQL Hello World demonstration completed successfully.");
}
