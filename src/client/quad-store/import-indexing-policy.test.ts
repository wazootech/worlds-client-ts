import { assertEquals } from "@std/assert";
import {
  resolveImportCommitProjectionFlags,
  shouldRunDeferredImportReindex,
} from "./import-indexing-policy.ts";

Deno.test("resolveImportCommitProjectionFlags - materialized incremental projects on import", () => {
  assertEquals(
    resolveImportCommitProjectionFlags(
      {
        searchIndexTopology: "materialized",
        searchIndexOnImport: "incremental",
      },
      "duringImportCommit",
    ),
    { skipSearchIndexProjection: false },
  );
});

Deno.test("resolveImportCommitProjectionFlags - materialized deferred skips import commit", () => {
  assertEquals(
    resolveImportCommitProjectionFlags(
      { searchIndexTopology: "materialized", searchIndexOnImport: "deferred" },
      "duringImportCommit",
    ),
    { skipSearchIndexProjection: true },
  );
  assertEquals(
    resolveImportCommitProjectionFlags(
      { searchIndexTopology: "materialized", searchIndexOnImport: "deferred" },
      "sparqlUpdateCommit",
    ),
    { skipSearchIndexProjection: false },
  );
});

Deno.test("resolveImportCommitProjectionFlags - scan topology always skips projection", () => {
  assertEquals(
    resolveImportCommitProjectionFlags(
      { searchIndexTopology: "scan", searchIndexOnImport: "incremental" },
      "duringImportCommit",
    ),
    { skipSearchIndexProjection: true },
  );
});

Deno.test("shouldRunDeferredImportReindex - materialized deferred with hook", () => {
  assertEquals(
    shouldRunDeferredImportReindex(
      { searchIndexTopology: "materialized", searchIndexOnImport: "deferred" },
      true,
    ),
    true,
  );
});

Deno.test("shouldRunDeferredImportReindex - scan requires explicit hook", () => {
  assertEquals(
    shouldRunDeferredImportReindex(
      { searchIndexTopology: "scan", searchIndexOnImport: "deferred" },
      false,
    ),
    false,
  );
  assertEquals(
    shouldRunDeferredImportReindex(
      { searchIndexTopology: "scan", searchIndexOnImport: "deferred" },
      true,
    ),
    true,
  );
});
