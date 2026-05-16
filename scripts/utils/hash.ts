import { encodeHex } from "@std/encoding/hex";

/**
 * getCorpusHash generates a stable SHA-256 hash for a given corpus string.
 * This is used to key the local LibSQL index cache.
 */
export async function getCorpusHash(corpus: string): Promise<string> {
  const data = new TextEncoder().encode(corpus);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return encodeHex(hashBuffer);
}
