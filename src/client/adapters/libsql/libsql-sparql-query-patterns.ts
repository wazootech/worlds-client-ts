/**
 * createSubjectBoundPropertiesSparqlQuery builds a hexastore-friendly BGP with a grounded subject IRI.
 *
 * Prefer this shape on hexastore `LibsqlStore` at production scale. Post-preload
 * benchmarks label it **selective**; see
 * [discussion #69](https://github.com/wazootech/worlds-client-ts/discussions/69).
 */
export function createSubjectBoundPropertiesSparqlQuery(
  subjectIri: string,
): string {
  return `SELECT ?property ?object WHERE { <${subjectIri}> ?property ?object }`;
}

/**
 * createCappedUnboundTriplePatternSparqlQuery builds `?s ?p ?o` with a LIMIT cap.
 *
 * Suitable for small corpora and local debugging only. On large graphs, libsqlStore pays wide SQL
 * and row materialization (benchmark **fullScan**); hydrate+N3 still wins that micro-benchmark but
 * both paths should avoid unbound triple patterns in production hot paths — see
 * [#68](https://github.com/wazootech/worlds-client-ts/issues/68).
 */
export function createCappedUnboundTriplePatternSparqlQuery(
  resultLimit: number,
): string {
  const safeLimit = Math.max(1, Math.floor(resultLimit));
  return `SELECT ?subject ?property ?object WHERE { ?subject ?property ?object } LIMIT ${safeLimit}`;
}
