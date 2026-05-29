import type * as rdfjs from "@rdfjs/types";

import type { SerializedQuad } from "./denokv-quad-store.ts";
import {
  buildIndexKey,
  buildPrimaryQuadKey,
  termKeyParts,
} from "./denokv-hexastore-keys.ts";
import type { DenokvHexastoreIndex } from "./denokv-hexastore-index-set.ts";

/**
 * MaterializeQuadKeysOptions configures key materialization for one quad.
 */
export interface MaterializeQuadKeysOptions {
  /** scopedDataPrefix is the generation-scoped KV prefix ([...keyPrefix, "g", generationId]). */
  scopedDataPrefix: Deno.KvKey;

  /** enabledIndexes lists which secondary index families to write. */
  enabledIndexes: readonly DenokvHexastoreIndex[];

  /** storedQuad is the RDF quad being persisted. */
  storedQuad: rdfjs.Quad;

  /** quadId is the stable hash identifier for the quad. */
  quadId: string;

  /** serializedQuad optionally supplies a pre-serialized quad payload. */
  serializedQuad?: SerializedQuad;
}

/**
 * materializeQuadKeys builds primary and secondary index keys for one quad.
 */
export function materializeQuadKeys(
  options: MaterializeQuadKeysOptions,
): {
  primaryKey: Deno.KvKey;
  indexKeys: Deno.KvKey[];
  serializedQuad: SerializedQuad;
} {
  const primaryKey = buildPrimaryQuadKey(
    options.scopedDataPrefix,
    options.quadId,
  );

  const serializedQuad: SerializedQuad = options.serializedQuad ?? {
    subject: serializeTerm(options.storedQuad.subject),
    predicate: serializeTerm(options.storedQuad.predicate),
    object: serializeTerm(options.storedQuad.object),
    graph: serializeTerm(options.storedQuad.graph),
  };

  const indexKeys: Deno.KvKey[] = [];

  const subjectParts = termKeyParts(options.storedQuad.subject);
  const predicateParts = termKeyParts(options.storedQuad.predicate);
  const objectParts = termKeyParts(options.storedQuad.object);
  const graphParts = termKeyParts(options.storedQuad.graph);

  if (options.enabledIndexes.includes("spog")) {
    indexKeys.push(
      buildIndexKey(
        options.scopedDataPrefix,
        "idx_spog",
        [...subjectParts, ...predicateParts, ...objectParts, ...graphParts],
        options.quadId,
      ),
    );
  }

  if (options.enabledIndexes.includes("sopg")) {
    indexKeys.push(
      buildIndexKey(
        options.scopedDataPrefix,
        "idx_sopg",
        [...subjectParts, ...objectParts, ...predicateParts, ...graphParts],
        options.quadId,
      ),
    );
  }

  if (options.enabledIndexes.includes("psog")) {
    indexKeys.push(
      buildIndexKey(
        options.scopedDataPrefix,
        "idx_psog",
        [...predicateParts, ...subjectParts, ...objectParts, ...graphParts],
        options.quadId,
      ),
    );
  }

  if (options.enabledIndexes.includes("posg")) {
    indexKeys.push(
      buildIndexKey(
        options.scopedDataPrefix,
        "idx_posg",
        [...predicateParts, ...objectParts, ...subjectParts, ...graphParts],
        options.quadId,
      ),
    );
  }

  if (options.enabledIndexes.includes("ospg")) {
    indexKeys.push(
      buildIndexKey(
        options.scopedDataPrefix,
        "idx_ospg",
        [...objectParts, ...subjectParts, ...predicateParts, ...graphParts],
        options.quadId,
      ),
    );
  }

  if (options.enabledIndexes.includes("opsg")) {
    indexKeys.push(
      buildIndexKey(
        options.scopedDataPrefix,
        "idx_opsg",
        [...objectParts, ...predicateParts, ...subjectParts, ...graphParts],
        options.quadId,
      ),
    );
  }

  if (options.enabledIndexes.includes("gspo")) {
    indexKeys.push(
      buildIndexKey(
        options.scopedDataPrefix,
        "idx_gspo",
        [...graphParts, ...subjectParts, ...predicateParts, ...objectParts],
        options.quadId,
      ),
    );
  }

  return { primaryKey, indexKeys, serializedQuad };
}

function serializeTerm(term: rdfjs.Term): SerializedQuad["subject"] {
  return {
    termType: term.termType,
    value: term.value,
    language: term.termType === "Literal"
      ? (term as rdfjs.Literal).language
      : undefined,
    datatype: term.termType === "Literal"
      ? (term as rdfjs.Literal).datatype.value
      : undefined,
  };
}
