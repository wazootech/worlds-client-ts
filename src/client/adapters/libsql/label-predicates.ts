/**
 * DEFAULT_LABEL_PREDICATES lists built-in predicate IRIs used for subject alias discovery at index time.
 */
export const DEFAULT_LABEL_PREDICATES: readonly string[] = [
  "http://www.w3.org/2000/01/rdf-schema#label",
  "http://www.w3.org/2004/02/skos/core#prefLabel",
  "http://schema.org/name",
] as const;

/**
 * resolveLabelPredicates merges caller extensions with built-in label IRIs (union, deduped, stable order).
 */
export function resolveLabelPredicates(
  labelPredicates?: string[],
): string[] {
  const seen = new Set<string>();
  const resolved: string[] = [];
  for (
    const predicate of [
      ...DEFAULT_LABEL_PREDICATES,
      ...(labelPredicates ?? []),
    ]
  ) {
    if (!seen.has(predicate)) {
      seen.add(predicate);
      resolved.push(predicate);
    }
  }
  return resolved;
}
