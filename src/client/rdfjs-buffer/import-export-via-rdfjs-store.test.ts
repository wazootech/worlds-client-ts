import { assertEquals } from "@std/assert";
import { DataFactory } from "n3";
import type * as rdfjs from "@rdfjs/types";
import type { PatchCommitContext } from "@/client/quad-store/commit-handler.ts";
import type { QuadTransaction } from "./quad-transaction.ts";
import { importViaBufferedRdfjsStore } from "./import-export-via-rdfjs-store.ts";

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

function createRecordingTransaction(): {
  transactionFactory: () => QuadTransaction;
  bufferedQuads: () => rdfjs.Quad[];
  lastCommitContext: () => PatchCommitContext | undefined;
} {
  const buffered: rdfjs.Quad[] = [];
  let lastContext: PatchCommitContext | undefined;

  const transactionFactory = (): QuadTransaction => ({
    addQuad(quadToAdd: rdfjs.Quad) {
      buffered.push(quadToAdd);
    },
    removeQuad(_quadToRemove: rdfjs.Quad) {
      // not used in these tests
    },
    commit(context?: PatchCommitContext) {
      lastContext = context;
      return Promise.resolve();
    },
    rollback() {
      buffered.length = 0;
    },
  });

  return {
    transactionFactory,
    bufferedQuads: () => buffered,
    lastCommitContext: () => lastContext,
  };
}

Deno.test("importViaBufferedRdfjsStore - buffers quads and commits with merge mode", async () => {
  const recording = createRecordingTransaction();

  await importViaBufferedRdfjsStore(
    { mode: "merge", source: { kind: "quads", quads: [q1, q2] } },
    { transactionFactory: recording.transactionFactory },
  );

  assertEquals(recording.bufferedQuads().length, 2);
  assertEquals(recording.lastCommitContext()?.importMode, "merge");
});

Deno.test("importViaBufferedRdfjsStore - defaults mode to merge", async () => {
  const recording = createRecordingTransaction();

  await importViaBufferedRdfjsStore(
    { source: { kind: "quads", quads: [q1] } },
    { transactionFactory: recording.transactionFactory },
  );

  assertEquals(recording.lastCommitContext()?.importMode, "merge");
});

Deno.test("importViaBufferedRdfjsStore - passes replace mode to commit context", async () => {
  const recording = createRecordingTransaction();

  await importViaBufferedRdfjsStore(
    { mode: "replace", source: { kind: "quads", quads: [q2] } },
    { transactionFactory: recording.transactionFactory },
  );

  assertEquals(recording.lastCommitContext()?.importMode, "replace");
});
