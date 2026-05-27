import { type Client, createClient } from "@libsql/client";
import { encodeHex } from "@std/encoding/hex";
import * as path from "@std/path";
import { SYNTHETIC_CORPUS_VERSION } from "./synthetic-data.ts";

/**
 * BENCH_LIBSQL_SCHEMA_VERSION bumps when LibSQL hexastore schema or crossover fixture layout changes.
 */
export const BENCH_LIBSQL_SCHEMA_VERSION = 1;

/** DEFAULT_CROSSOVER_CACHE_DIR is the default on-disk cache root for large crossover libsqlStore fixtures. */
const BENCHMARKS_ROOT = path.fromFileUrl(new URL("../..", import.meta.url));

/** DEFAULT_CROSSOVER_CACHE_DIR stores large crossover libsqlStore database files under benchmarks/.cache. */
export const DEFAULT_CROSSOVER_CACHE_DIR = path.join(
  BENCHMARKS_ROOT,
  ".cache",
  "crossover-large",
);

/**
 * CrossoverFixtureChecksumInputs lists manifest fields hashed for bench DB cache identity.
 */
export interface CrossoverFixtureChecksumInputs {
  /** syntheticCorpusVersion tracks generateSyntheticQuads revisions. */
  syntheticCorpusVersion: number;
  /** benchLibsqlSchemaVersion tracks LibSQL schema revisions relevant to crossover fixtures. */
  benchLibsqlSchemaVersion: number;
  /** quadCount is the synthetic corpus size for this fixture. */
  quadCount: number;
  /** backend labels the crossover wiring (large cache supports libsqlStore only). */
  backend: "libsqlStore";
  /** searchIndexOnImport records the indexing mode used during import. */
  searchIndexOnImport: "disabled";
}

/**
 * CrossoverFixtureManifest persists checksum inputs plus the computed digest on disk.
 */
export interface CrossoverFixtureManifest
  extends CrossoverFixtureChecksumInputs {
  /** checksum is the SHA-256 hex digest of canonical CrossoverFixtureChecksumInputs JSON. */
  checksum: string;
}

/**
 * CrossoverDbCachePaths locates the SQLite file and JSON sidecar for a cached crossover fixture.
 */
export interface CrossoverDbCachePaths {
  /** databasePath is the absolute path to the LibSQL SQLite file. */
  databasePath: string;
  /** databaseFileUrl is the libsql client URL for databasePath. */
  databaseFileUrl: string;
  /** manifestPath is the absolute path to the JSON manifest sidecar. */
  manifestPath: string;
}

/**
 * CachedCrossoverFixtureValidation holds expected row counts for a cache hit check.
 */
export interface CachedCrossoverFixtureValidation {
  /** quadCount is the expected number of rows in the quads table. */
  quadCount: number;
  /** expectedChecksum is the digest that must match the manifest sidecar. */
  expectedChecksum: string;
}

/**
 * isBenchReuseDbEnabled returns true when BENCH_REUSE_DB=1 enables on-disk crossover fixture reuse.
 */
export function isBenchReuseDbEnabled(): boolean {
  return Deno.env.get("BENCH_REUSE_DB") === "1";
}

/**
 * resolveCrossoverDbCacheDirectory returns the cache root from BENCH_DB_CACHE_DIR or the default.
 */
export function resolveCrossoverDbCacheDirectory(): string {
  const overrideDirectory = Deno.env.get("BENCH_DB_CACHE_DIR");
  if (overrideDirectory && overrideDirectory.length > 0) {
    return path.resolve(overrideDirectory);
  }
  return DEFAULT_CROSSOVER_CACHE_DIR;
}

/**
 * resolveCrossoverDbCachePaths builds database and manifest paths for a libsqlStore crossover scale.
 */
export function resolveCrossoverDbCachePaths(
  quadCount: number,
  backend: "libsqlStore",
): CrossoverDbCachePaths {
  const cacheDirectory = resolveCrossoverDbCacheDirectory();
  const databasePath = path.join(
    cacheDirectory,
    `${backend}-${quadCount}.db`,
  );
  const manifestPath = path.join(
    cacheDirectory,
    `${backend}-${quadCount}.json`,
  );
  return {
    databasePath,
    databaseFileUrl: path.toFileUrl(databasePath).href,
    manifestPath,
  };
}

/**
 * buildCrossoverFixtureChecksumInputs constructs the canonical inputs for a libsqlStore quads-only fixture.
 */
export function buildCrossoverFixtureChecksumInputs(
  quadCount: number,
): CrossoverFixtureChecksumInputs {
  return {
    syntheticCorpusVersion: SYNTHETIC_CORPUS_VERSION,
    benchLibsqlSchemaVersion: BENCH_LIBSQL_SCHEMA_VERSION,
    quadCount,
    backend: "libsqlStore",
    searchIndexOnImport: "disabled",
  };
}

/**
 * computeCrossoverFixtureChecksum returns a SHA-256 hex digest of canonical fixture checksum inputs.
 */
export async function computeCrossoverFixtureChecksum(
  inputs: CrossoverFixtureChecksumInputs,
): Promise<string> {
  const canonicalJson = JSON.stringify(inputs);
  const encodedInputs = new TextEncoder().encode(canonicalJson);
  const digestBuffer = await crypto.subtle.digest("SHA-256", encodedInputs);
  return encodeHex(new Uint8Array(digestBuffer));
}

/**
 * readCrossoverFixtureManifest loads a manifest sidecar when present.
 */
export async function readCrossoverFixtureManifest(
  manifestPath: string,
): Promise<CrossoverFixtureManifest | undefined> {
  try {
    const manifestText = await Deno.readTextFile(manifestPath);
    return JSON.parse(manifestText) as CrossoverFixtureManifest;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return undefined;
    }
    throw error;
  }
}

/**
 * writeCrossoverFixtureManifest persists a manifest sidecar after a successful cache build.
 */
export async function writeCrossoverFixtureManifest(
  manifestPath: string,
  manifest: CrossoverFixtureManifest,
): Promise<void> {
  await Deno.writeTextFile(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

/**
 * ensureCrossoverCacheDirectoryExists creates the cache directory when missing.
 */
export async function ensureCrossoverCacheDirectoryExists(
  cacheDirectory: string,
): Promise<void> {
  await Deno.mkdir(cacheDirectory, { recursive: true });
}

/**
 * removeStaleCrossoverCacheFiles deletes a partial or invalid database and manifest pair.
 */
export async function removeStaleCrossoverCacheFiles(
  cachePaths: CrossoverDbCachePaths,
): Promise<void> {
  await Promise.all([
    Deno.remove(cachePaths.databasePath).catch(() => undefined),
    Deno.remove(cachePaths.manifestPath).catch(() => undefined),
  ]);
}

/**
 * validateCachedLibsqlCrossoverDatabase checks quad/chunk counts for a quads-only crossover cache hit.
 */
export async function validateCachedLibsqlCrossoverDatabase(
  databaseClient: Client,
  validation: CachedCrossoverFixtureValidation,
): Promise<boolean> {
  const quadCountResult = await databaseClient.execute(
    "SELECT COUNT(*) AS total FROM quads",
  );
  const chunkCountResult = await databaseClient.execute(
    "SELECT COUNT(*) AS total FROM chunks",
  );
  const storedQuadCount = Number(quadCountResult.rows[0]?.total ?? -1);
  const storedChunkCount = Number(chunkCountResult.rows[0]?.total ?? -1);
  return storedQuadCount === validation.quadCount &&
    storedChunkCount === 0;
}

/**
 * tryResolveCrossoverCacheHit validates manifest and database state; logs cache miss reasons.
 */
export async function tryResolveCrossoverCacheHit(
  cachePaths: CrossoverDbCachePaths,
  expectedChecksum: string,
  quadCount: number,
): Promise<boolean> {
  const manifest = await readCrossoverFixtureManifest(cachePaths.manifestPath);
  if (!manifest) {
    console.log(`cache miss (${cachePaths.manifestPath}: no manifest)`);
    return false;
  }
  if (manifest.checksum !== expectedChecksum) {
    console.log("cache miss (manifest checksum mismatch)");
    return false;
  }

  try {
    await Deno.stat(cachePaths.databasePath);
  } catch {
    console.log(`cache miss (${cachePaths.databasePath}: database missing)`);
    return false;
  }

  const databaseClient = createClient({ url: cachePaths.databaseFileUrl });

  try {
    const isValid = await validateCachedLibsqlCrossoverDatabase(
      databaseClient,
      {
        quadCount,
        expectedChecksum,
      },
    );
    if (!isValid) {
      console.log("cache miss (quad or chunk count mismatch)");
    }
    return isValid;
  } finally {
    databaseClient.close();
  }
}
