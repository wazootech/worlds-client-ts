import { assertEquals } from "@std/assert";
import { assessAnswer, normalizeText } from "./score.ts";
import { parseArgs } from "./evaluate.ts";

Deno.test("normalizeText lowercases and removes punctuation", () => {
  assertEquals(normalizeText("  Tide-Shell!  "), "tideshell");
});

Deno.test("normalizeText handles unicode letters", () => {
  assertEquals(normalizeText("Café"), "café");
});

Deno.test("assessAnswer accepts exact matches inside final answers", () => {
  const result = assessAnswer("The capital is Lume.", "Lume");
  assertEquals(result, { correct: true, matchKind: "exact" });
});

Deno.test("assessAnswer accepts aliases as a distinct match kind", () => {
  const result = assessAnswer(
    "It is the northern realm.",
    "Borealis",
    ["northern realm"],
  );

  assertEquals(result, { correct: true, matchKind: "alias" });
});

Deno.test("assessAnswer rejects unrelated answers", () => {
  const result = assessAnswer("I do not know.", "Moonwell", [
    "Moonwell Nation",
  ]);
  assertEquals(result, { correct: false, matchKind: "wrong" });
});

Deno.test("assessAnswer matches single-word answer as whole-answer exact", () => {
  const result = assessAnswer("lume", "Lume");
  assertEquals(result, { correct: true, matchKind: "exact" });
});

Deno.test("assessAnswer matches multi-word phrase as contiguous substring", () => {
  const result = assessAnswer(
    "I think it is tide shell, actually.",
    "tide shell",
  );
  assertEquals(result, { correct: true, matchKind: "exact" });
});

Deno.test("parseArgs defaults to the local Ollama target", () => {
  const previousBaseUrl = Deno.env.get("OLLAMA_BASE_URL");
  Deno.env.delete("OLLAMA_BASE_URL");

  try {
    assertEquals(parseArgs([]), {
      baseUrl: "http://localhost:11434/v1",
      corpusPath: "benchmarks/ai-sdk-recall/corpus.ttl",
      debug: false,
      forceTools: false,
      modelId: "qwen2.5:1.5b-instruct",
      outputPath: undefined,
      questionsPath: "benchmarks/ai-sdk-recall/questions.json",
      runs: 3,
    });
  } finally {
    if (previousBaseUrl === undefined) {
      Deno.env.delete("OLLAMA_BASE_URL");
    } else {
      Deno.env.set("OLLAMA_BASE_URL", previousBaseUrl);
    }
  }
});

Deno.test("parseArgs accepts local model and base URL overrides", () => {
  assertEquals(
    parseArgs([
      "--base-url",
      "http://localhost:11435/v1",
      "--model",
      "hermes3:3b",
      "--runs",
      "5",
      "--output",
      "results.json",
    ]),
    {
      baseUrl: "http://localhost:11435/v1",
      corpusPath: "benchmarks/ai-sdk-recall/corpus.ttl",
      debug: false,
      forceTools: false,
      modelId: "hermes3:3b",
      outputPath: "results.json",
      questionsPath: "benchmarks/ai-sdk-recall/questions.json",
      runs: 5,
    },
  );
});

Deno.test("parseArgs accepts debug and force-tools flags", () => {
  assertEquals(parseArgs(["--debug", "--force-tools"]), {
    baseUrl: "http://localhost:11434/v1",
    corpusPath: "benchmarks/ai-sdk-recall/corpus.ttl",
    debug: true,
    forceTools: true,
    modelId: "qwen2.5:1.5b-instruct",
    outputPath: undefined,
    questionsPath: "benchmarks/ai-sdk-recall/questions.json",
    runs: 3,
  });
});
