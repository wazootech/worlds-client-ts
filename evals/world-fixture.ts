import { createClient as createLibsqlClient } from "@libsql/client";
import { Client } from "@worlds/client";
import { provideLibsql } from "@worlds/client/providers/libsql";

/** GENID_BASE is the production-style skolem prefix for eval fixture entities. */
export const GENID_BASE = "https://worlds.wazoo.dev/.well-known/genid/";

/** WAZOO_VOCAB_NAMESPACE is the shared vocabulary namespace for eval predicates. */
export const WAZOO_VOCAB_NAMESPACE = "https://worlds.wazoo.dev/vocab/";

/** WORK_SUBJECT_URI is the canonical subject IRI for the seeded work entity. */
export const WORK_SUBJECT_URI = `${GENID_BASE}c4f8e2a91b0d7e3f`;

/** PROTAGONIST_SUBJECT_URI is the canonical subject IRI for the seeded protagonist. */
export const PROTAGONIST_SUBJECT_URI = `${GENID_BASE}8a1b2c3d4e5f6071`;

/** WORK_SEARCH_LABEL is the opaque rdfs:label literal used in search prompts. */
export const WORK_SEARCH_LABEL = "q7Xm9pRw";

/** PROTAGONIST_LABEL is the opaque rdfs:label literal for the protagonist entity. */
export const PROTAGONIST_LABEL = "m4Tp1XnK";

/** AUTHOR_LITERAL is the opaque ex:author literal on the work entity. */
export const AUTHOR_LITERAL = "k2Nw8LhT";

/** EXPECTED_HOUSE_LITERAL is the opaque ex:house literal the happy-path scenarios must discover. */
export const EXPECTED_HOUSE_LITERAL = "pZ3kN8vQ";

/** DISTRACTOR_WORK_SUBJECT_URI is the subject IRI for the second seeded work entity. */
export const DISTRACTOR_WORK_SUBJECT_URI = `${GENID_BASE}1d6a9f3e7b2c4058`;

/** DISTRACTOR_PROTAGONIST_SUBJECT_URI is the subject IRI for the distractor protagonist. */
export const DISTRACTOR_PROTAGONIST_SUBJECT_URI =
  `${GENID_BASE}6e0f1a2b3c4d5e6f`;

/** DISTRACTOR_WORK_SEARCH_LABEL is the opaque rdfs:label for the distractor work entity. */
export const DISTRACTOR_WORK_SEARCH_LABEL = "r5Hv2KjW";

/** DISTRACTOR_PROTAGONIST_LABEL is the opaque rdfs:label for the distractor protagonist. */
export const DISTRACTOR_PROTAGONIST_LABEL = "w8Nz4QmL";

/** DISTRACTOR_AUTHOR_LITERAL is the opaque ex:author literal on the distractor work. */
export const DISTRACTOR_AUTHOR_LITERAL = "n3Jc7VfR";

/** DISTRACTOR_EXPECTED_HOUSE_LITERAL is the house literal linked to the distractor protagonist. */
export const DISTRACTOR_EXPECTED_HOUSE_LITERAL = "j6Tx1BpY";

/** BLOCKED_INSERT_SUBJECT_URI is an unrelated genid used only by sparql-updates-blocked. */
export const BLOCKED_INSERT_SUBJECT_URI = `${GENID_BASE}f91c0e4b2a198765`;

/** BLOCKED_INSERT_LITERAL is an opaque literal paired with BLOCKED_INSERT_SUBJECT_URI. */
export const BLOCKED_INSERT_LITERAL = "h9Br2Lmx";

/** UNKNOWN_WORK_SEARCH_LABEL is a label absent from the seeded graph for search-miss scenarios. */
export const UNKNOWN_WORK_SEARCH_LABEL = "z9Qk4WnP";

const SEEDED_WORLD_DATA = `
  @prefix vocab: <${WAZOO_VOCAB_NAMESPACE}> .
  @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
  <${WORK_SUBJECT_URI}> rdfs:label "${WORK_SEARCH_LABEL}" ;
                        vocab:author "${AUTHOR_LITERAL}" ;
                        vocab:protagonist <${PROTAGONIST_SUBJECT_URI}> .
  <${PROTAGONIST_SUBJECT_URI}> rdfs:label "${PROTAGONIST_LABEL}" ;
           vocab:house "${EXPECTED_HOUSE_LITERAL}" .
  <${DISTRACTOR_WORK_SUBJECT_URI}> rdfs:label "${DISTRACTOR_WORK_SEARCH_LABEL}" ;
                                   vocab:author "${DISTRACTOR_AUTHOR_LITERAL}" ;
                                   vocab:protagonist <${DISTRACTOR_PROTAGONIST_SUBJECT_URI}> .
  <${DISTRACTOR_PROTAGONIST_SUBJECT_URI}> rdfs:label "${DISTRACTOR_PROTAGONIST_LABEL}" ;
           vocab:house "${DISTRACTOR_EXPECTED_HOUSE_LITERAL}" .
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
