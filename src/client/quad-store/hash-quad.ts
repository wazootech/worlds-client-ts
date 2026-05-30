import type * as rdfjs from "@rdfjs/types";
import { canonize } from "rdf-canonize";
import { encodeBase64Url } from "@std/encoding/base64url";

/**
 * hashQuad computes a deterministic, canonical ID for a single Quad
 * using RDFC-1.0 and base64url encoding.
 *
 * This is functionally equivalent to "Skolemizing" the statement into a stable primary key.
 */
export async function hashQuad(quad: rdfjs.Quad): Promise<string> {
  const canonical = await canonize([quad], {
    algorithm: "RDFC-1.0",
    format: "application/n-quads",
  });
  const encoded = new TextEncoder().encode(canonical);
  return encodeBase64Url(encoded);
}

/**
 * hashQuads computes deterministic canonical IDs for multiple quads in parallel.
 */
export async function hashQuads(quads: rdfjs.Quad[]): Promise<string[]> {
  try {
    return await Promise.all(quads.map((quad) => hashQuad(quad)));
  } catch (cause) {
    throw new Error("failed to compute content hashes for incoming quads", {
      cause,
    });
  }
}
