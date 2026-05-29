import type * as rdfjs from "@rdfjs/types";
import { Writer } from "n3";

import type {
  ExportRequest,
  ExportResponse,
  ImportRequest,
  QuadStoreInterface,
} from "@/client/quad-store/mod.ts";
import { hashQuad } from "@/client/quad-store/mod.ts";
import {
  getFormat,
  materializeImportQuads,
} from "@/client/quad-store/rdf-formats.ts";

import {
  buildGenerationDataPrefix,
  buildPrimaryQuadKey,
} from "./denokv-hexastore-keys.ts";
import {
  DEFAULT_DENOKV_HEXASTORE_INDEXES,
  type DenokvHexastoreIndex,
} from "./denokv-hexastore-index-set.ts";
import {
  bumpDatasetGeneration,
  garbageCollectOrphanedGenerations,
  readActiveGeneration,
} from "./denokv-dataset-generation.ts";
import { commitBatchedKvMutations } from "./denokv-kv-limits.ts";
import { materializeQuadKeys } from "./denokv-quad-keys.ts";
import type { SerializedQuad } from "./denokv-serialization.ts";
import { deserializeQuad, serializeTerm } from "./denokv-serialization.ts";

export type { SerializedQuad, SerializedTerm } from "./denokv-serialization.ts";
export { deserializeTerm } from "./denokv-serialization.ts";

/**
 * DenokvQuadStoreOptions specifies the configuration for the Deno Kv adapter.
 */
export interface DenokvQuadStoreOptions {
  /** kv is the underlying Deno Kv database instance. */
  kv: Deno.Kv;

  /** keyPrefix is the namespace prefix for stored quads to avoid key collisions. Defaults to ["quads"]. */
  keyPrefix?: Deno.KvKey;

  /**
   * enabledHexastoreIndexes controls which KV secondary-index families are materialized.
   * Defaults to all supported index families.
   */
  enabledHexastoreIndexes?: readonly DenokvHexastoreIndex[];
}

/**
 * DenokvQuadStore provides persistent storage of RDF quads using Deno Kv.
 */
export class DenokvQuadStore implements QuadStoreInterface {
  public constructor(
    private readonly options: DenokvQuadStoreOptions,
  ) {}

  public async import(request: ImportRequest): Promise<void> {
    const mode = request.mode ?? "merge";
    const keyPrefix = this.options.keyPrefix ?? ["quads"];
    const enabledIndexes = this.options.enabledHexastoreIndexes ??
      DEFAULT_DENOKV_HEXASTORE_INDEXES;

    const generationId = mode === "replace"
      ? await bumpDatasetGeneration(this.options.kv, keyPrefix)
      : await readActiveGeneration(this.options.kv, keyPrefix);

    const scopedDataPrefix = buildGenerationDataPrefix(
      keyPrefix,
      generationId,
    );

    const quadsToImport = await materializeImportQuads(request.source);

    const kvMutations: Array<{ key: Deno.KvKey; value: unknown }> = [];

    for (const storedQuad of quadsToImport) {
      const quadId = await hashQuad(storedQuad);
      const { primaryKey, indexKeys, serializedQuad } = materializeQuadKeys({
        scopedDataPrefix,
        enabledIndexes,
        storedQuad,
        quadId,
        serializedQuad: {
          subject: serializeTerm(storedQuad.subject),
          predicate: serializeTerm(storedQuad.predicate),
          object: serializeTerm(storedQuad.object),
          graph: serializeTerm(storedQuad.graph),
        },
      });

      kvMutations.push({ key: primaryKey, value: serializedQuad });
      for (const indexKey of indexKeys) {
        kvMutations.push({ key: indexKey, value: quadId });
      }
    }

    await commitBatchedKvMutations(this.options.kv, (batch) => {
      for (const { key, value } of kvMutations) {
        batch.set(key, value);
      }
    });

    if (mode === "replace") {
      await garbageCollectOrphanedGenerations(this.options.kv, keyPrefix);
    }
  }

  public async export(request: ExportRequest): Promise<ExportResponse> {
    const keyPrefix = this.options.keyPrefix ?? ["quads"];
    const enabledIndexes = this.options.enabledHexastoreIndexes ??
      DEFAULT_DENOKV_HEXASTORE_INDEXES;
    const generationId = await readActiveGeneration(
      this.options.kv,
      keyPrefix,
    );
    const scopedDataPrefix = buildGenerationDataPrefix(
      keyPrefix,
      generationId,
    );

    const quads: rdfjs.Quad[] = [];

    if (enabledIndexes.includes("spog")) {
      const pendingIds: string[] = [];

      const iter = this.options.kv.list<string>({
        prefix: [...scopedDataPrefix, "idx_spog"],
      });

      for await (const entry of iter) {
        pendingIds.push(entry.value);
        if (pendingIds.length >= MAX_KV_GET_MANY_SIZE) {
          quads.push(
            ...await resolveQuadsByIds(
              this.options.kv,
              scopedDataPrefix,
              pendingIds,
            ),
          );
          pendingIds.length = 0;
        }
      }

      if (pendingIds.length > 0) {
        quads.push(
          ...await resolveQuadsByIds(
            this.options.kv,
            scopedDataPrefix,
            pendingIds,
          ),
        );
      }
    } else {
      const iter = this.options.kv.list<SerializedQuad>({
        prefix: [...scopedDataPrefix, "quads"],
      });

      for await (const entry of iter) {
        if (!entry.value) continue;
        quads.push(deserializeQuad(entry.value));
      }
    }

    if (request.format.kind === "quads") {
      return { kind: "quads", quads };
    }

    if (request.format.kind === "serialized") {
      const contentType = request.format.contentType ?? "application/n-quads";
      const { n3Format } = getFormat(contentType);

      const writer = new Writer({ format: n3Format });
      for (const q of quads) {
        writer.addQuad(q);
      }

      const data = await new Promise<string>((resolve, reject) => {
        writer.end((error: Error | null, result?: string) => {
          if (error) reject(error);
          else resolve(result ?? "");
        });
      });

      return { kind: "serialized", data, contentType };
    }

    throw new Error("Unsupported export format");
  }
}

/** MAX_KV_GET_MANY_SIZE is Deno KV's per-call getMany key cap. */
export const MAX_KV_GET_MANY_SIZE = 10;

async function resolveQuadsByIds(
  kv: Deno.Kv,
  scopedDataPrefix: Deno.KvKey,
  quadIds: readonly string[],
): Promise<rdfjs.Quad[]> {
  const resolved: rdfjs.Quad[] = [];

  for (
    let offset = 0;
    offset < quadIds.length;
    offset += MAX_KV_GET_MANY_SIZE
  ) {
    const quadIdBatch = quadIds.slice(offset, offset + MAX_KV_GET_MANY_SIZE);
    const keys = quadIdBatch.map((quadId) =>
      buildPrimaryQuadKey(scopedDataPrefix, quadId)
    );
    const entries = await kv.getMany(keys) as Array<
      Deno.KvEntryMaybe<SerializedQuad>
    >;

    for (const entry of entries) {
      if (!entry.value) continue;
      resolved.push(deserializeQuad(entry.value));
    }
  }

  return resolved;
}
