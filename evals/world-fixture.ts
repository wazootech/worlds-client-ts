import { createClient as createLibsqlClient } from "@libsql/client";
import { Client } from "@worlds/client";
import { provideLibsql } from "@worlds/client/providers/libsql";

const SEEDED_WORLD_DATA = `
  @prefix ex: <http://example.com/> .
  @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
  ex:HarryPotter rdfs:label "Harry Potter" ;
                 ex:author "J.K. Rowling" ;
                 ex:protagonist ex:Harry .
  ex:Harry rdfs:label "Harry" ;
           ex:house "Gryffindor" .
`;

/** createSeededWorldClient builds a fresh in-memory world with the seeded graph. */
export async function createSeededWorldClient(): Promise<Client> {
  const database = createLibsqlClient({ url: ":memory:" });
  const providerOptions = await provideLibsql({ client: database });
  const client = new Client(providerOptions);

  await client.import({
    source: {
      kind: "serialized",
      data: SEEDED_WORLD_DATA,
      contentType: "text/turtle",
    },
  });

  return client;
}
