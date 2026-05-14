import { createClient as createLibsqlClient } from "@libsql/client";
import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { Client } from "@worlds/client";
import { provideLibsql } from "@worlds/client/providers/libsql";
import { UniversalSentenceEncoderEmbeddingService } from "@worlds/client/providers/tfjs-universal-sentence-encoder";
import { createTools } from "../../examples/ai-sdk-hello-world/tools.ts";

interface BenchmarkQuestion {
  id: string;
  question: string;
  answers: string[];
}

interface BenchmarkRow {
  questionId: string;
  condition: "without-tools" | "with-tools";
  run: number;
  answer: string;
  correct: boolean;
  toolCalls: number;
}

interface BenchmarkSummary {
  withoutToolsAccuracy: number;
  withToolsAccuracy: number;
  delta: number;
  rows: BenchmarkRow[];
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isCorrectAnswer(answer: string, expectedAnswers: string[]): boolean {
  const normalizedAnswer = normalizeText(answer);
  return expectedAnswers.some((expectedAnswer) => {
    const normalizedExpected = normalizeText(expectedAnswer);
    return normalizedExpected.length > 0 &&
      normalizedAnswer.includes(normalizedExpected);
  });
}

async function loadQuestions(path: string): Promise<BenchmarkQuestion[]> {
  const fileContents = await Deno.readTextFile(path);
  return JSON.parse(fileContents) as BenchmarkQuestion[];
}

async function buildClient(corpusPath: string): Promise<Client> {
  const corpusText = await Deno.readTextFile(corpusPath);
  const database = createLibsqlClient({ url: ":memory:" });
  const client = new Client(
    await provideLibsql({
      client: database,
      embeddingService: new UniversalSentenceEncoderEmbeddingService(),
      vectorDimensions: 512,
    }),
  );

  await client.import({
    source: {
      kind: "serialized",
      contentType: "text/turtle",
      data: corpusText,
    },
  });

  return client;
}

async function answerWithoutTools(
  model: ReturnType<ReturnType<typeof createGoogleGenerativeAI>>,
  question: BenchmarkQuestion,
): Promise<string> {
  const result = await generateText({
    model,
    prompt:
      `Answer the question using only your own knowledge. Do not use any tools. Respond with only the final answer.\n\nQuestion: ${question.question}`,
  });

  return result.text.trim();
}

async function answerWithTools(
  model: ReturnType<ReturnType<typeof createGoogleGenerativeAI>>,
  client: Client,
  question: BenchmarkQuestion,
): Promise<{ answer: string; toolCalls: number }> {
  const tools = createTools(client, {
    sparql: { allowUpdates: false },
  });

  const result = await generateText({
    model,
    tools,
    maxSteps: 5,
    prompt:
      `Use the Worlds tools to answer the question. First search for the relevant facts, then use SPARQL to verify the final answer. Respond with only the final answer.\n\nQuestion: ${question.question}`,
  });

  const toolCalls = result.steps.flatMap((step) => step.toolCalls).length;
  return { answer: result.text.trim(), toolCalls };
}

function parseArgs(args: string[]): {
  corpusPath: string;
  modelId: string;
  outputPath?: string;
  questionsPath: string;
  runs: number;
} {
  let corpusPath = "benchmarks/ai-sdk-recall/corpus.ttl";
  let modelId = "gemini-2.5-flash";
  let outputPath: string | undefined;
  let questionsPath = "benchmarks/ai-sdk-recall/questions.json";
  let runs = 3;

  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === "--corpus") corpusPath = args[++index] ?? corpusPath;
    else if (argument === "--model") modelId = args[++index] ?? modelId;
    else if (argument === "--output") outputPath = args[++index];
    else if (argument === "--questions") {
      questionsPath = args[++index] ?? questionsPath;
    } else if (argument === "--runs") {
      runs = Number(args[++index] ?? runs);
    } else if (argument === "--help" || argument === "-h") {
      console.log(
        [
          "Usage: deno run -A benchmarks/ai-sdk-recall/evaluate.ts [--corpus path] [--questions path] [--model gemini-2.5-flash] [--runs 3] [--output results.json]",
          "",
          "Environment:",
          "  GEMINI_API_KEY is required.",
        ].join("\n"),
      );
      Deno.exit(0);
    }
  }

  return { corpusPath, modelId, outputPath, questionsPath, runs };
}

function printSummary(summary: BenchmarkSummary): void {
  console.log(`Without tools accuracy: ${(summary.withoutToolsAccuracy * 100).toFixed(1)}%`);
  console.log(`With tools accuracy: ${(summary.withToolsAccuracy * 100).toFixed(1)}%`);
  console.log(`Delta: ${(summary.delta * 100).toFixed(1)}%`);
  console.log("");
  console.log("questionId | condition | run | correct | toolCalls | answer");
  console.log("---|---|---:|---|---:|---");
  for (const row of summary.rows) {
    console.log(
      `${row.questionId} | ${row.condition} | ${row.run} | ${row.correct ? "yes" : "no"} | ${row.toolCalls} | ${row.answer.replace(/\|/g, "\\|")}`,
    );
  }
}

async function run(): Promise<BenchmarkSummary> {
  const { corpusPath, modelId, outputPath, questionsPath, runs } = parseArgs(
    Deno.args,
  );
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiApiKey) {
    throw new Error("GEMINI_API_KEY is required.");
  }

  const google = createGoogleGenerativeAI({ apiKey: geminiApiKey });
  const model = google(modelId);
  const client = await buildClient(corpusPath);
  const questions = await loadQuestions(questionsPath);

  const rows: BenchmarkRow[] = [];
  for (let runIndex = 1; runIndex <= runs; runIndex++) {
    for (const question of questions) {
      const withoutToolsAnswer = await answerWithoutTools(model, question);
      rows.push({
        questionId: question.id,
        condition: "without-tools",
        run: runIndex,
        answer: withoutToolsAnswer,
        correct: isCorrectAnswer(withoutToolsAnswer, question.answers),
        toolCalls: 0,
      });

      const withToolsResult = await answerWithTools(model, client, question);
      rows.push({
        questionId: question.id,
        condition: "with-tools",
        run: runIndex,
        answer: withToolsResult.answer,
        correct: isCorrectAnswer(withToolsResult.answer, question.answers),
        toolCalls: withToolsResult.toolCalls,
      });
    }
  }

  const withoutToolsRows = rows.filter((row) => row.condition === "without-tools");
  const withToolsRows = rows.filter((row) => row.condition === "with-tools");
  const withoutToolsAccuracy = withoutToolsRows.filter((row) => row.correct).length /
    Math.max(withoutToolsRows.length, 1);
  const withToolsAccuracy = withToolsRows.filter((row) => row.correct).length /
    Math.max(withToolsRows.length, 1);

  const summary = {
    withoutToolsAccuracy,
    withToolsAccuracy,
    delta: withToolsAccuracy - withoutToolsAccuracy,
    rows,
  };

  if (outputPath) {
    await Deno.writeTextFile(outputPath, JSON.stringify(summary, null, 2));
  }

  return summary;
}

if (import.meta.main) {
  const summary = await run();
  printSummary(summary);
}
