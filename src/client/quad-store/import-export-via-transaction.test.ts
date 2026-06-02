import { assertEquals } from "@std/assert";
import { DataFactory } from "n3";
import type * as rdfjs from "@rdfjs/types";
import type { TransactionContext } from "@/client/quad-store/transaction-context.ts";
import { Transaction } from "./transaction.ts";
import { importViaTransaction } from "./import-export-via-transaction.ts";

const { namedNode, literal, quad } = DataFactory;

const fixtureQuad1 = quad(
  namedNode("http://example.org/s1"),
  namedNode("http://example.org/p1"),
  literal("one"),
);
const fixtureQuad2 = quad(
  namedNode("http://example.org/s2"),
  namedNode("http://example.org/p2"),
  literal("two"),
);

function createRecordingTransaction(): {
  createTransaction: () => Transaction;
  bufferedQuads: () => rdfjs.Quad[];
  lastCommitContext: () => TransactionContext | undefined;
} {
  const buffered: rdfjs.Quad[] = [];
  let lastContext: TransactionContext | undefined;

  const createTransaction = (): Transaction => {
    const tx = new Transaction({
      commit: (patch, context) => {
        lastContext = context;
        // push insertions
        for (const quad of patch.insertions) {
          buffered.push(quad);
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
    {
      mode: "merge",
      source: { kind: "quads", quads: [fixtureQuad1, fixtureQuad2] },
    },
    { createTransaction: recording.createTransaction },
  );

  assertEquals(recording.bufferedQuads().length, 2);
  assertEquals(recording.lastCommitContext()?.importMode, "merge");
});

Deno.test("importViaTransaction - defaults mode to merge", async () => {
  const recording = createRecordingTransaction();

  await importViaTransaction(
    { source: { kind: "quads", quads: [fixtureQuad1] } },
    { createTransaction: recording.createTransaction },
  );

  assertEquals(recording.lastCommitContext()?.importMode, "merge");
});

Deno.test("importViaTransaction - passes replace mode to commit context", async () => {
  const recording = createRecordingTransaction();

  await importViaTransaction(
    { mode: "replace", source: { kind: "quads", quads: [fixtureQuad2] } },
    { createTransaction: recording.createTransaction },
  );

  assertEquals(recording.lastCommitContext()?.importMode, "replace");
});
