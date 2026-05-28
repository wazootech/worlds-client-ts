import { type Client, createClient } from "@libsql/client";
import { encodeHex } from "@std/encoding/hex";
import * as path from "@std/path";
import { SYNTHETIC_CORPUS_VERSION } from "./synthetic-data.ts";

/**
 * BENCH_LIBSQL_SCHEMA_VERSION bumps when LibSQL hexastore schema or perf fixture layout changes.
 */
export const BENCH_LIBSQL_SCHEMA_VERSION = 1;

/** DEFAULT_HEXASTORE_PERF_CACHE_DIR is the default on-disk cache root for large libsqlStore perf fixtures. */
const BENCHMARKS_ROOT = path.fromFileUrl(new URL("../..", import.meta.url));

/** DEFAULT_HEXASTORE_PERF_CACHE_DIR stores large libsqlStore database files under benchmarks/.cache. */
export const DEFAULT_HEXASTORE_PERF_CACHE_DIR = path.join(
  BENCHMARKS_ROOT,
  ".cache",
  "hexastore-perf-large",
);

/**
 * HexastorePerfFixtureChecksumInputs lists manifest fields hashed for bench DB cache identity.
 */
export interface HexastorePerfFixtureChecksumInputs {
  /** syntheticCorpusVersion tracks generateSyntheticQuads revisions. */
  syntheticCorpusVersion: number;
  /** benchLibsqlSchemaVersion tracks LibSQL schema revisions relevant to perf fixtures. */
  benchLibsqlSchemaVersion: number;
  /** quadCount is the synthetic corpus size for this fixture. */
  quadCount: number;
  /** backend labels the hexastore wiring (large cache supports libsqlStore only). */
  backend: "libsqlStore";
  /** searchIndexOnImport records the indexing mode used during import. */
  searchIndexOnImport: "disabled";
}

/**
 * HexastorePerfFixtureManifest persists checksum inputs plus the computed digest on disk.
 */
export interface HexastorePerfFixtureManifest
  extends HexastorePerfFixtureChecksumInputs {
  /** checksum is the SHA-256 hex digest of canonical HexastorePerfFixtureChecksumInputs JSON. */
  checksum: string;
}

/**
 * HexastorePerfDbCachePaths locates the SQLite file and JSON sidecar for a cached perf fixture.
 */
export interface HexastorePerfDbCachePaths {
  /** databasePath is the absolute path to the LibSQL SQLite file. */
  databasePath: string;
  /** databaseFileUrl is the libsql client URL for databasePath. */
  databaseFileUrl: string;
  /** manifestPath is the absolute path to the JSON manifest sidecar. */
  manifestPath: string;
}

/**
 * CachedHexastorePerfFixtureValidation holds expected row counts for a cache hit check.
 */
export interface CachedHexastorePerfFixtureValidation {
  /** quadCount is the expected number of rows in the quads table. */
  quadCount: number;
  /** expectedChecksum is the digest that must match the manifest sidecar. */
  expectedChecksum: string;
}

/**
 * isBenchReuseDbEnabled returns true when BENCH_REUSE_DB=1 enables on-disk libsql perf fixture reuse.
 */
export function isBenchReuseDbEnabled(): boolean {
  return Deno.env.get("BENCH_REUSE_DB") === "1";
}

/**
 * isBenchHexastorePerfFullScanEnabled returns true when fullScan benches are registered (opt-in).
 */
export function isBenchHexastorePerfFullScanEnabled(): boolean {
  return Deno.env.get("BENCH_HEXASTORE_PERF_FULL_SCAN") === "1" ||
    Deno.env.get("BENCH_CROSSOVER_FULL_SCAN") === "1";
}

/**
 * resolveHexastorePerfDbCacheDirectory returns the cache root from BENCH_DB_CACHE_DIR or the default.
 */
export function resolveHexastorePerfDbCacheDirectory(): string {
  const overrideDirectory = Deno.env.get("BENCH_DB_CACHE_DIR");
  if (overrideDirectory && overrideDirectory.length > 0) {
    return path.resolve(overrideDirectory);
  }
  return DEFAULT_HEXASTORE_PERF_CACHE_DIR;
}

/**
 * resolveHexastorePerfDbCachePaths builds database and manifest paths for a libsqlStore perf scale.
 */
export function resolveHexastorePerfDbCachePaths(
  quadCount: number,
  backend: "libsqlStore",
): HexastorePerfDbCachePaths {
  const cacheDirectory = resolveHexastorePerfDbCacheDirectory();
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
 * buildHexastorePerfFixtureChecksumInputs constructs the canonical inputs for a libsqlStore quads-only fixture.
 */
export function buildHexastorePerfFixtureChecksumInputs(
  quadCount: number,
): HexastorePerfFixtureChecksumInputs {
  return {
    syntheticCorpusVersion: SYNTHETIC_CORPUS_VERSION,
    benchLibsqlSchemaVersion: BENCH_LIBSQL_SCHEMA_VERSION,
    quadCount,
    backend: "libsqlStore",
    searchIndexOnImport: "disabled",
  };
}

/**
 * computeHexastorePerfFixtureChecksum returns a SHA-256 hex digest of canonical fixture checksum inputs.
 */
export async function computeHexastorePerfFixtureChecksum(
  inputs: HexastorePerfFixtureChecksumInputs,
): Promise<string> {
  const canonicalJson = JSON.stringify(inputs);
  const encodedInputs = new TextEncoder().encode(canonicalJson);
  const digestBuffer = await crypto.subtle.digest("SHA-256", encodedInputs);
  return encodeHex(new Uint8Array(digestBuffer));
}

/**
 * readHexastorePerfFixtureManifest loads a manifest sidecar when present.
 */
export async function readHexastorePerfFixtureManifest(
  manifestPath: string,
): Promise<HexastorePerfFixtureManifest | undefined> {
  try {
    const manifestText = await Deno.readTextFile(manifestPath);
    return JSON.parse(manifestText) as HexastorePerfFixtureManifest;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return undefined;
    }
    throw error;
  }
}

/**
 * writeHexastorePerfFixtureManifest persists a manifest sidecar after a successful cache build.
 */
export async function writeHexastorePerfFixtureManifest(
  manifestPath: string,
  manifest: HexastorePerfFixtureManifest,
): Promise<void> {
  await Deno.writeTextFile(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

/**
 * ensureHexastorePerfCacheDirectoryExists creates the cache directory when missing.
 */
export async function ensureHexastorePerfCacheDirectoryExists(
  cacheDirectory: string,
): Promise<void> {
  await Deno.mkdir(cacheDirectory, { recursive: true });
}

/**
 * removeStaleHexastorePerfCacheFiles deletes a partial or invalid database and manifest pair.
 */
export async function removeStaleHexastorePerfCacheFiles(
  cachePaths: HexastorePerfDbCachePaths,
): Promise<void> {
  await Promise.all([
    Deno.remove(cachePaths.databasePath).catch(() => undefined),
    Deno.remove(cachePaths.manifestPath).catch(() => undefined),
  ]);
}

/**
 * validateCachedLibsqlHexastorePerfDatabase checks quad/chunk counts for a quads-only cache hit.
 */
export async function validateCachedLibsqlHexastorePerfDatabase(
  databaseClient: Client,
  validation: CachedHexastorePerfFixtureValidation,
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
 * tryResolveHexastorePerfCacheHit validates manifest and database state; logs cache miss reasons.
 */
export async function tryResolveHexastorePerfCacheHit(
  cachePaths: HexastorePerfDbCachePaths,
  expectedChecksum: string,
  quadCount: number,
): Promise<boolean> {
  const manifest = await readHexastorePerfFixtureManifest(
    cachePaths.manifestPath,
  );
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
    const isValid = await validateCachedLibsqlHexastorePerfDatabase(
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
