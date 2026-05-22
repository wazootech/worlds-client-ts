import type { ChunkRowPayload } from "./chunk-quads.ts";

/**
 * formatQuadChunkText builds a natural-language fact string for embedding and FTS indexing.
 */
export function formatQuadChunkText(chunk: ChunkRowPayload): string {
  const subjectLabel = extractRdfLocalLabel(chunk.subject);
  const predicatePhrase = formatPredicatePhrase(chunk.predicate);
  return `Factual context about ${subjectLabel}: ${subjectLabel} ${predicatePhrase} ${chunk.value}.`;
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
