import { assertEquals, assertExists, assertNotEquals } from "@std/assert";
import { createClient } from "@libsql/client";
import * as path from "@std/path";
import { Client } from "@worlds/client";
import { createLibsqlAdapter } from "@worlds/client/adapters/libsql";
import type { Quad } from "@rdfjs/types";
import {
  buildCrossoverFixtureChecksumInputs,
  computeCrossoverFixtureChecksum,
  readCrossoverFixtureManifest,
  resolveCrossoverDbCachePaths,
  validateCachedLibsqlCrossoverDatabase,
  writeCrossoverFixtureManifest,
} from "./crossover-db-cache.ts";
import { generateSyntheticQuads } from "./synthetic-data.ts";

async function importCorpusIntoLibsqlHexastoreForTest(
  databaseClient: ReturnType<typeof createClient>,
  corpusQuads: Quad[],
): Promise<void> {
  const adapter = await createLibsqlAdapter({
    client: databaseClient,
    searchIndexOnImport: "disabled",
  });
  const worldsClient = new Client(adapter);
  await worldsClient.import({
    source: { kind: "quads", quads: corpusQuads },
  });
}

Deno.test(
  "computeCrossoverFixtureChecksum - stable digest for identical inputs",
  async () => {
    const checksumInputs = buildCrossoverFixtureChecksumInputs(1000);
    const firstChecksum = await computeCrossoverFixtureChecksum(checksumInputs);
    const secondChecksum = await computeCrossoverFixtureChecksum(
      checksumInputs,
    );
    assertEquals(firstChecksum, secondChecksum);
  },
);

Deno.test(
  "computeCrossoverFixtureChecksum - different corpus version changes digest",
  async () => {
    const baselineInputs = buildCrossoverFixtureChecksumInputs(1000);
    const baselineChecksum = await computeCrossoverFixtureChecksum(
      baselineInputs,
    );
    const alteredInputs = {
      ...baselineInputs,
      syntheticCorpusVersion: baselineInputs.syntheticCorpusVersion + 1,
    };
    const alteredChecksum = await computeCrossoverFixtureChecksum(
      alteredInputs,
    );
    assertNotEquals(baselineChecksum, alteredChecksum);
  },
);

Deno.test(
  "resolveCrossoverDbCachePaths - names libsqlStore database and manifest files",
  () => {
    const cachePaths = resolveCrossoverDbCachePaths(10, "libsqlStore");
    assertEquals(cachePaths.databasePath.endsWith("libsqlStore-10.db"), true);
    assertEquals(cachePaths.manifestPath.endsWith("libsqlStore-10.json"), true);
    assertEquals(
      cachePaths.databaseFileUrl.includes("libsqlStore-10.db"),
      true,
    );
  },
);

Deno.test(
  "validateCachedLibsqlCrossoverDatabase - accepts quads-only in-memory fixture",
  async () => {
    const databaseClient = createClient({ url: ":memory:" });
    try {
      await importCorpusIntoLibsqlHexastoreForTest(
        databaseClient,
        generateSyntheticQuads(10),
      );
      const expectedChecksum = await computeCrossoverFixtureChecksum(
        buildCrossoverFixtureChecksumInputs(10),
      );
      const isValid = await validateCachedLibsqlCrossoverDatabase(
        databaseClient,
        { quadCount: 10, expectedChecksum },
      );
      assertEquals(isValid, true);
    } finally {
      databaseClient.close();
    }
  },
);

Deno.test(
  "writeCrossoverFixtureManifest - round-trips manifest JSON",
  async () => {
    const temporaryDirectory = await Deno.makeTempDir();
    const manifestPath = path.join(temporaryDirectory, "libsqlStore-10.json");
    try {
      const checksumInputs = buildCrossoverFixtureChecksumInputs(10);
      const expectedChecksum = await computeCrossoverFixtureChecksum(
        checksumInputs,
      );
      const manifest = { ...checksumInputs, checksum: expectedChecksum };
      await writeCrossoverFixtureManifest(manifestPath, manifest);
      const parsedManifest = await readCrossoverFixtureManifest(manifestPath);
      assertExists(parsedManifest);
      assertEquals(parsedManifest.checksum, expectedChecksum);
      assertEquals(parsedManifest.quadCount, 10);
    } finally {
      await Deno.remove(manifestPath);
      await Deno.remove(temporaryDirectory);
    }
  },
);
