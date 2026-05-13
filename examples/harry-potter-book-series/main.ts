import { createClient } from "@libsql/client";
import { Client } from "@worlds/client";
import { provideLibsql } from "@worlds/client/providers/libsql";
import { UniversalSentenceEncoderEmbeddingService } from "@worlds/client/providers/tfjs-universal-sentence-encoder";

/**
 * This example demonstrates creating a persistent Harry Potter knowledge base
 * using native 512-dimensional vectors from the Universal Sentence Encoder.
 */
if (import.meta.main) {
  const dbUrl = "file:" + import.meta.dirname + "/hp.db";
  console.log(`🚀 Initializing durable LibSQL context at ${dbUrl}...`);
  const db = createClient({ url: dbUrl });

  console.log("🧠 Initializing Universal Sentence Encoder...");
  const embeddingService = new UniversalSentenceEncoderEmbeddingService();

  console.log("🧠 Provisioning LibSQL sync engine (vectorDimensions: 512)...");
  const providerOptions = await provideLibsql({
    client: db,
    embeddingService,
    vectorDimensions: 512,
  });

  const client = new Client(providerOptions);
  console.log("💡 Gateway operational!");

  // Idempotency check: see if we already have the Harry Potter books imported.
  console.log("🔍 Checking if books are already imported...");

  // N3/SPARQL engine usually returns a boolean for ASK queries.
  // Wait, the search/sparql API in wazoo-worlds returns an array or boolean?
  // Let's just do a SELECT check to be safe.
  const hasBooks = await client.sparql({
    query: `
      PREFIX hp: <http://example.com/hp/>
      SELECT ?title WHERE { hp:book_1 hp:title ?title }
    `,
  });

  if (hasBooks.kind === "select" && hasBooks.data.results.bindings.length > 0) {
    console.log(
      "✅ Harry Potter books already exist in the database. Skipping import.",
    );
  } else {
    console.log("📝 Importing Harry Potter series knowledge...");
    await client.import({
      source: {
        kind: "serialized",
        data: `
          @prefix hp: <http://example.com/hp/> .
          @prefix schema: <http://schema.org/> .

          hp:book_1 hp:title "Harry Potter and the Sorcerer's Stone" ;
                    hp:description "An orphaned boy enrolls in a school of wizardry, where he learns the truth about himself, his family and the terrible evil that haunts the magical world." ;
                    hp:year "1997" .

          hp:book_2 hp:title "Harry Potter and the Chamber of Secrets" ;
                    hp:description "Harry ignores warnings not to return to Hogwarts, only to find the school plagued by a series of mysterious attacks and a strange voice haunting him." ;
                    hp:year "1998" .

          hp:book_3 hp:title "Harry Potter and the Prisoner of Azkaban" ;
                    hp:description "Harry's third year at Hogwarts is marred by the escape of Sirius Black from Azkaban. Harry learns more about his past." ;
                    hp:year "1999" .

          hp:book_4 hp:title "Harry Potter and the Goblet of Fire" ;
                    hp:description "Harry finds himself selected as an underaged competitor in a dangerous multi-wizardry school tournament." ;
                    hp:year "2000" .

          hp:book_5 hp:title "Harry Potter and the Order of the Phoenix" ;
                    hp:description "With their warning about Lord Voldemort's return scoffed at, Harry and Dumbledore are targeted by the Wizard authorities as an authoritarian bureaucrat slowly seizes power at Hogwarts." ;
                    hp:year "2003" .

          hp:book_6 hp:title "Harry Potter and the Half-Blood Prince" ;
                    hp:description "As Harry Potter begins his sixth year at Hogwarts, he discovers an old book marked as 'the property of the Half-Blood Prince' and begins to learn more about Lord Voldemort's dark past." ;
                    hp:year "2005" .

          hp:book_7 hp:title "Harry Potter and the Deathly Hallows" ;
                    hp:description "Harry, Ron, and Hermione race against time to destroy the remaining Horcruxes and uncover the truth about the Deathly Hallows in their final battle against Lord Voldemort." ;
                    hp:year "2007" .
        `,
        contentType: "text/turtle",
      },
    });
    console.log("✅ Knowledge imported successfully.");
  }

  // Perform a semantic search query
  const queryText =
    "A mysterious and dangerous tournament between wizarding schools.";
  console.log(`\n🔍 Searching for: "${queryText}"`);

  const searchResponse = await client.search({ query: queryText });

  console.log("\n🏆 Top Search Results:");
  console.log(JSON.stringify(searchResponse, null, 2));

  console.log("\n🏁 Demo concluded successfully!");
}
