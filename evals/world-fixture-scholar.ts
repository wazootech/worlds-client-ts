import { createClient as createLibsqlClient } from "@libsql/client";
import { Client } from "@worlds/client";
import { provideLibsql } from "@worlds/client/providers/libsql";

/** GENID_BASE is the production-style skolem prefix for eval fixture entities. */
export const GENID_BASE = "https://worlds.wazoo.dev/.well-known/genid/";

/** WAZOO_VOCAB_NAMESPACE is the shared vocabulary namespace for eval predicates. */
export const WAZOO_VOCAB_NAMESPACE = "https://worlds.wazoo.dev/vocab/";

/** PAPER_SUBJECT_URI is the canonical subject IRI for the seeded paper entity. */
export const PAPER_SUBJECT_URI = `${GENID_BASE}a1b2c3d4e5f6a7b8`;

/** PAPER_SEARCH_LABEL is the opaque rdfs:label literal used in search prompts. */
export const PAPER_SEARCH_LABEL = "kL9mN4pQ";

/** PAPER_AUTHOR_LITERAL is the opaque vocab:author literal on the paper entity. */
export const PAPER_AUTHOR_LITERAL = "dR7sT2vW";

/** PAPER_VENUE_LITERAL is the opaque vocab:venue literal for the publication venue. */
export const PAPER_VENUE_LITERAL = "xY5zA8bC";

/** PAPER_YEAR_LITERAL is the opaque vocab:year literal for the publication year. */
export const PAPER_YEAR_LITERAL = "2024";

const SEEDED_SCHOLAR_DATA = `
  @prefix vocab: <${WAZOO_VOCAB_NAMESPACE}> .
  @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
  <${PAPER_SUBJECT_URI}> rdfs:label "${PAPER_SEARCH_LABEL}" ;
                         vocab:author "${PAPER_AUTHOR_LITERAL}" ;
                         vocab:venue "${PAPER_VENUE_LITERAL}" ;
                         vocab:year "${PAPER_YEAR_LITERAL}" .
`;

/** createSeededScholarWorldClient builds a fresh in-memory world with the scholar graph. */
export async function createSeededScholarWorldClient(): Promise<Client> {
  const database = createLibsqlClient({ url: ":memory:" });
  const providerOptions = await provideLibsql({ client: database });
  const client = new Client(providerOptions);

  await client.import({
    source: {
      kind: "serialized",
      data: SEEDED_SCHOLAR_DATA,
      contentType: "text/turtle",
    },
  });

  return client;
}
