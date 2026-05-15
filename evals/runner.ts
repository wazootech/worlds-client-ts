import { createClient as createLibsqlClient } from "@libsql/client";
import { generateText, stepCountIs } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { Client } from "@worlds/client";
import { provideLibsql } from "@worlds/client/providers/libsql";
import { UniversalSentenceEncoderEmbeddingService } from "@worlds/client/providers/tfjs-universal-sentence-encoder";
import { createTools } from "../examples/ai-sdk-hello-world/tools.ts";
import type {
  EvalFixture,
  EvalRunRow,
  ExperimentConfig,
  ExperimentSummary,
  PerModelResult,
} from "./types.ts";
import { discoverEvals, loadEval } from "./registry.ts";

type BenchmarkModel = Parameters<typeof generateText>[0]["model"];

async function buildClient(corpus: string): Promise<Client> {
  const database = createLibsqlClient({ url: ":memory:" });
  const modelPath = "./models/tfjs-universal-sentence-encoder/model.json";
  const vocabPath = "./models/tfjs-universal-sentence-encoder/vocab.json";
  let modelExists = false;
  try {
    Deno.statSync(modelPath);
    Deno.statSync(vocabPath);
    modelExists = true;
  } catch {
    console.warn(
      "Local TFJS model artifacts not found. Defaulting to online download.",
    );
  }

  const client = new Client(
    await provideLibsql({
      client: database,
      embeddingService: new UniversalSentenceEncoderEmbeddingService(
        modelExists ? { modelUrl: modelPath, vocabUrl: vocabPath } : {},
      ),
      vectorDimensions: 512,
    }),
  );

  await client.import({
    source: {
      kind: "serialized",
      contentType: "text/turtle",
      data: corpus,
    },
  });

  return client;
}

async function answerWithoutTools(
  model: BenchmarkModel,
  question: string,
): Promise<string> {
  const result = await generateText({
    model,
    prompt:
      `Answer the question using only your own knowledge. Do not use any tools. Respond with only the final answer.\n\nQuestion: ${question}`,
  });

  return result.text.trim();
}

async function answerWithTools(
  model: BenchmarkModel,
  client: Client,
  question: string,
  forceTools: boolean,
  debug: boolean,
): Promise<{ answer: string; toolCalls: number; toolTrace: string[] }> {
  const tools = createTools(client, {
    sparql: { allowUpdates: false },
  });

  const result = await generateText({
    model,
    tools,
    toolChoice: forceTools ? "required" : "auto",
    stopWhen: stepCountIs(8),
    prompt:
      `Use the Worlds tools to answer the question. First search for the relevant facts, then use SPARQL to verify the final answer. Respond with only the final answer.\n\nQuestion: ${question}`,
    onStepFinish: debug
      ? (event) => {
        if (event.toolCalls.length > 0) {
          console.log(JSON.stringify(event.toolCalls, null, 2));
        }
      }
      : undefined,
  });

  const toolCalls = result.steps.flatMap((step) => step.toolCalls).length;
  const toolTrace = result.steps.flatMap((step) =>
    step.toolCalls.map((toolCall) => JSON.stringify(toolCall))
  );
  return { answer: result.text.trim(), toolCalls, toolTrace };
}

function printRow(
  conditionName: string,
  runIndex: number,
  questionId: string,
  correct: boolean,
  matchKind: string,
  toolCalls: number,
  answer: string,
): void {
  console.log(
    `[${conditionName}] run=${runIndex} q=${questionId} correct=${
      correct ? "yes" : "no"
    } match=${matchKind} tools=${toolCalls} answer=${answer}`,
  );
}

async function runEvalFixture(
  fixture: EvalFixture,
  model: BenchmarkModel,
  client: Client | undefined,
  config: ExperimentConfig,
  options?: { debug?: boolean },
): Promise<PerModelResult[]> {
  const results: PerModelResult[] = [];

  for (const condition of config.conditions) {
    console.log(
      `  Condition: ${condition.name} (${fixture.questions.length} questions × ${config.runs} runs)`,
    );

    const rows: EvalRunRow[] = [];

    for (let runIndex = 1; runIndex <= config.runs; runIndex++) {
      for (const question of fixture.questions) {
        let answer: string;
        let toolCalls = 0;
        let toolTrace: string[] | undefined;

        if (condition.name === "without-tools") {
          answer = await answerWithoutTools(model, question.question);
        } else {
          const result = await answerWithTools(
            model,
            client!,
            question.question,
            condition.forceTools ?? false,
            options?.debug ?? false,
          );
          answer = result.answer;
          toolCalls = result.toolCalls;
          toolTrace = options?.debug ? result.toolTrace : undefined;
        }

        const assessment = fixture.score(answer, question);
        rows.push({
          questionId: question.id,
          condition: condition.name,
          model: "",
          run: runIndex,
          answer,
          correct: assessment.correct,
          matchKind: assessment.matchKind,
          toolCalls,
          toolTrace,
        });

        if (options?.debug) {
          printRow(
            condition.name,
            runIndex,
            question.id,
            assessment.correct,
            assessment.matchKind,
            toolCalls,
            answer,
          );
        }
      }
    }

    const correctCount = rows.filter((r) => r.correct).length;
    const totalCount = rows.length;
    const exactMatches = rows.filter((r) => r.matchKind === "exact").length;
    const aliasMatches = rows.filter((r) => r.matchKind === "alias").length;
    const wrongMatches = rows.filter((r) => r.matchKind === "wrong").length;
    const toolUsageCount = rows.filter((r) => r.toolCalls > 0).length;
    const accuracy = totalCount > 0 ? correctCount / totalCount : 0;
    const toolUsageRate = totalCount > 0 ? toolUsageCount / totalCount : 0;

    results.push({
      model: "",
      condition: condition.name,
      accuracy,
      toolUsageRate,
      exactMatches,
      aliasMatches,
      wrongMatches,
    });

    console.log(
      `    Accuracy: ${
        (accuracy * 100).toFixed(1)
      }% (${correctCount}/${totalCount})  Tools used: ${
        (toolUsageRate * 100).toFixed(1)
      }%  (exact:${exactMatches} alias:${aliasMatches} wrong:${wrongMatches})`,
    );
  }

  const withToolsResult = results.find((r) => r.condition === "with-tools");
  const withoutToolsResult = results.find(
    (r) => r.condition === "without-tools",
  );
  if (withToolsResult && withoutToolsResult) {
    const delta = withToolsResult.accuracy - withoutToolsResult.accuracy;
    console.log(
      `    Delta (with-tools - without-tools): ${(delta * 100).toFixed(1)}%`,
    );
  }

  return results;
}

export async function runExperiment(
  config: ExperimentConfig,
  options?: { debug?: boolean; dry?: boolean },
): Promise<ExperimentSummary> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString().replace(/[:]/g, "-");

  const evalNames = config.evals.length === 1 && config.evals[0] === "*"
    ? await discoverEvals()
    : config.evals;

  const openai = createOpenAI({ baseURL: config.baseUrl, apiKey: "ollama" });
  const allResults: PerModelResult[] = [];

  for (const evalName of evalNames) {
    if (options?.dry) {
      console.log(`[dry-run] would run eval fixture: ${evalName}`);
      continue;
    }

    const fixture = await loadEval(evalName);
    console.log(
      `\nEval: ${fixture.name} (${fixture.questions.length} questions)`,
    );

    for (const modelEntry of config.models) {
      const model = openai(modelEntry.id) as unknown as BenchmarkModel;
      const displayModel = modelEntry.displayName ?? modelEntry.id;
      console.log(`  Model: ${displayModel}`);

      let client: Client | undefined;
      const needsClient = config.conditions.some(
        (c) => c.name === "with-tools",
      );
      if (needsClient) {
        console.log("  Building client with corpus...");
        client = await buildClient(fixture.corpus);
      }

      const runOptions = { debug: options?.debug };
      const perModelResults = await runEvalFixture(
        fixture,
        model,
        client,
        config,
        runOptions,
      );

      for (const result of perModelResults) {
        allResults.push({
          ...result,
          model: displayModel,
        });
      }

      const resultsDir = new URL(
        `../results/${config.name}/${timestamp}/${fixture.name}/${displayModel}/`,
        import.meta.url,
      );
      Deno.mkdirSync(resultsDir, { recursive: true });

      await Deno.writeTextFile(
        new URL("summary.json", resultsDir),
        JSON.stringify(perModelResults, null, 2),
      );
    }
  }

  const durationMs = Date.now() - startTime;
  const summary: ExperimentSummary = {
    experimentName: config.name,
    timestamp,
    durationMs,
    models: allResults,
  };

  const experimentDir = new URL(
    `../results/${config.name}/${timestamp}/`,
    import.meta.url,
  );
  Deno.mkdirSync(experimentDir, { recursive: true });
  await Deno.writeTextFile(
    new URL("summary.json", experimentDir),
    JSON.stringify(summary, null, 2),
  );

  return summary;
}
