import { assertEquals } from "@std/assert";
import { DataFactory } from "n3";
import type * as rdfjs from "@rdfjs/types";
import type { PatchCommitContext } from "@/client/quad-store/commit-handler.ts";
import { Transaction } from "./transaction.ts";
import { importViaTransaction } from "./import-export-via-transaction.ts";

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
  createTransaction: () => Transaction;
  bufferedQuads: () => rdfjs.Quad[];
  lastCommitContext: () => PatchCommitContext | undefined;
} {
  const buffered: rdfjs.Quad[] = [];
  let lastContext: PatchCommitContext | undefined;

  const createTransaction = (): Transaction => {
    const tx = new Transaction({
      commit: (patch, context) => {
        lastContext = context;
        // push insertions
        for (const q of patch.insertions) {
          buffered.push(q);
        }
        return Promise.resolve();
      },
    });
    return tx;
  };

  return {
    createTransaction,
    bufferedQuads: () => buffered,
    lastCommitContext: () => lastContext,
  };
}

Deno.test("importViaTransaction - buffers quads and commits with merge mode", async () => {
  const recording = createRecordingTransaction();

  await importViaTransaction(
    { mode: "merge", source: { kind: "quads", quads: [q1, q2] } },
    { createTransaction: recording.createTransaction },
  );

  assertEquals(recording.bufferedQuads().length, 2);
  assertEquals(recording.lastCommitContext()?.importMode, "merge");
});

Deno.test("importViaTransaction - defaults mode to merge", async () => {
  const recording = createRecordingTransaction();

  await importViaTransaction(
    { source: { kind: "quads", quads: [q1] } },
    { createTransaction: recording.createTransaction },
  );

  assertEquals(recording.lastCommitContext()?.importMode, "merge");
});

Deno.test("importViaTransaction - passes replace mode to commit context", async () => {
  const recording = createRecordingTransaction();

  await importViaTransaction(
    { mode: "replace", source: { kind: "quads", quads: [q2] } },
    { createTransaction: recording.createTransaction },
  );

  assertEquals(recording.lastCommitContext()?.importMode, "replace");
});
