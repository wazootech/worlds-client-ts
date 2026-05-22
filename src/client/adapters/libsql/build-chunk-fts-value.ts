import type { ChunkRowPayload } from "@/client/search-index/quad-chunker/mod.ts";

/**
 * BuildChunkFtsValueOptions supplies subject label literals looked up from durable quads.
 */
export interface BuildChunkFtsValueOptions {
  /** labelLiteralsForSubject lists configured label predicate object values for the chunk subject. */
  labelLiteralsForSubject: string[];
}

/**
 * buildChunkFtsValue composes space-separated discovery tokens for FTS and semantic indexing.
 */
export function buildChunkFtsValue(
  chunk: ChunkRowPayload,
  options: BuildChunkFtsValueOptions,
): string {
  const tokens: string[] = [
    extractRdfLocalLabel(chunk.subject),
    formatPredicatePhrase(chunk.predicate),
    chunk.value,
    ...options.labelLiteralsForSubject,
  ];
  return tokens.filter((token) => token.length > 0).join(" ");
}

/**
 * extractRdfLocalLabel returns a short human-readable label from an IRI or term value.
 */
export function extractRdfLocalLabel(iri: string): string {
  const trimmed = iri.trim();
  if (trimmed.length === 0) {
    return "unknown entity";
  }

  const hashIndex = trimmed.lastIndexOf("#");
  if (hashIndex >= 0 && hashIndex < trimmed.length - 1) {
    return humanizeToken(trimmed.slice(hashIndex + 1));
  }

  const slashIndex = trimmed.lastIndexOf("/");
  if (slashIndex >= 0 && slashIndex < trimmed.length - 1) {
    return humanizeToken(trimmed.slice(slashIndex + 1));
  }

  return humanizeToken(trimmed);
}

/**
 * formatPredicatePhrase converts a predicate IRI into a short verb phrase.
 */
export function formatPredicatePhrase(predicateIri: string): string {
  const localName = extractRdfLocalLabel(predicateIri);
  return localName.toLowerCase();
}

/**
 * humanizeToken decodes common IRI local-name separators into spaced words.
 */
function humanizeToken(token: string): string {
  const withSpaces = token
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();

  if (withSpaces.length === 0) {
    return token;
  }

  return withSpaces;
}
