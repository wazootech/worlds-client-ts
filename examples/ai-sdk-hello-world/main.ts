import { createClient } from "@libsql/client";
import { ComunicaSparqlEngine } from "@worlds/client/adapters/comunica";
import { createLibsqlClient } from "@worlds/client/adapters/libsql";
import { QueryEngine } from "@comunica/query-sparql-rdfjs-lite";
import { createTools } from "./tools.ts";
import { generateText, stepCountIs } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

if (import.meta.main) {
  const google = createGoogleGenerativeAI();

  console.log("Initializing embedded LibSQL knowledge base...");
  const database = createClient({ url: ":memory:" });
  const queryEngine = new QueryEngine();

  const client = await createLibsqlClient({
    client: database,
    createSparqlEngine: ({ libsqlStore }) =>
      new ComunicaSparqlEngine({ queryEngine, store: libsqlStore }),
  });

  console.log("Ingesting initial knowledge...");
  await client.import({
    source: {
      kind: "serialized",
      data: `
        @prefix ex: <http://example.com/> .
        @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
        ex:HarryPotter rdfs:label "Harry Potter" ;
                       ex:author "J.K. Rowling" ;
                       ex:protagonist ex:Harry .
        ex:Harry rdfs:label "Harry" ;
                 ex:house "Gryffindor" .
      `,
      contentType: "text/turtle",
    },
  });

  console.log("Generating AI tools...");
  const tools = createTools(client, {
    sparql: { allowUpdates: false },
  });

  console.log("Querying the AI...");

  const output = await generateText({
    model: google("gemini-2.5-flash"),
    tools,
    stopWhen: stepCountIs(5),
    prompt:
      "Find out what house the protagonist of Harry Potter is in. First, use 'searchWorld' to discover the subject URI for Harry Potter. Then, write an 'executeSparql' query to look up the properties/relations of that URI so you can traverse to the protagonist and find their house.",
  });

  console.log("\nTool Call History:");
  for (const step of output.steps) {
    if (step.toolCalls.length > 0) {
      console.log(JSON.stringify(step.toolCalls, null, 2));
    }
  }
}
