import { assertEquals } from "@std/assert";
import { DataFactory } from "n3";
import type * as rdfjs from "@rdfjs/types";
import type { PatchCommitContext } from "./commit-handler.ts";
import type { CommittingRdfjsStore } from "./import-export-via-rdfjs-store.ts";
import { importViaBufferedRdfjsStore } from "./import-export-via-rdfjs-store.ts";
import { noopImportLifecycle } from "@/client/commit-sync/mod.ts";

const { namedNode, literal, quad } = DataFactory;

const q1 = quad(
  namedNode("http://example.org/s1"),
  namedNode("http://example.org/p1"),
  literal("one"),
);
const q2 = quad(
  namedNode("http://example.org/s2"),
  namedNode("http://example.org/p2"),
  literal("two"),
);

function createRecordingCommittingStore(): {
  store: CommittingRdfjsStore;
  bufferedQuads: () => rdfjs.Quad[];
  lastCommitContext: () => PatchCommitContext | undefined;
} {
  const buffered: rdfjs.Quad[] = [];
  let lastContext: PatchCommitContext | undefined;

  const store: CommittingRdfjsStore = {
    addQuad(quadToAdd) {
      buffered.push(quadToAdd);
    },
    match() {
      throw new Error("match not used in import runner tests");
    },
    commit(context) {
      lastContext = context;
      return Promise.resolve();
    },
  };

  return {
    store,
    bufferedQuads: () => buffered,
    lastCommitContext: () => lastContext,
  };
}

Deno.test("importViaBufferedRdfjsStore - buffers quads and commits with merge mode", async () => {
  const recording = createRecordingCommittingStore();

  await importViaBufferedRdfjsStore(
    { mode: "merge", source: { kind: "quads", quads: [q1, q2] } },
    noopImportLifecycle,
    { rdfjsStore: recording.store },
  );

  assertEquals(recording.bufferedQuads().length, 2);
  assertEquals(recording.lastCommitContext()?.importMode, "merge");
});

Deno.test("importViaBufferedRdfjsStore - defaults mode to merge", async () => {
  const recording = createRecordingCommittingStore();

  await importViaBufferedRdfjsStore(
    { source: { kind: "quads", quads: [q1] } },
    noopImportLifecycle,
    { rdfjsStore: recording.store },
  );

  assertEquals(recording.lastCommitContext()?.importMode, "merge");
});

Deno.test("importViaBufferedRdfjsStore - passes replace mode to commit context", async () => {
  const recording = createRecordingCommittingStore();

  await importViaBufferedRdfjsStore(
    { mode: "replace", source: { kind: "quads", quads: [q2] } },
    noopImportLifecycle,
    { rdfjsStore: recording.store },
  );

  assertEquals(recording.lastCommitContext()?.importMode, "replace");
});
