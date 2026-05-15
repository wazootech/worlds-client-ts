import { createClient as createLibsqlClient } from "@libsql/client";
import { generateText, stepCountIs } from "ai";
import { createOllama } from "@ai-sdk/ollama";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { Client } from "@worlds/client";
import { provideLibsql } from "@worlds/client/providers/libsql";
import { UniversalSentenceEncoderEmbeddingService } from "@worlds/client/providers/tfjs-universal-sentence-encoder";
import { createTools } from "../examples/ai-sdk-hello-world/tools.ts";
import { evaluateQuestion } from "./evaluators/mod.ts";
import type {
  EvalFixture,
  EvalRunRow,
  ExperimentConfig,
  ExperimentSummary,
  PerQuestionClassSummary,
  PerModelResult,
} from "./types.ts";
import { discoverEvals, loadEval } from "./registry.ts";
import { average, computeCostPerCorrectAnswer, computeMedian } from "./runner/metrics.ts";
import { countRedundantToolCalls, parseToolName } from "./runner/tool-trace.ts";

type BenchmarkModel = Parameters<typeof generateText>[0]["model"];

interface EvalFixtureRunResult {
  perModelResults: PerModelResult[];
  rowsByCondition: Record<string, EvalRunRow[]>;
}

export interface AnswerMetrics {
  answer: string;
  toolCalls: number;
  toolTrace: string[];
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  toolSequence: string[];
  redundantToolCalls: number;
}

/**
 * isTransientError returns true only for retryable API errors (rate limits, server errors, network failures).
 */
function isTransientError(error: unknown): boolean {
  if (error instanceof TypeError) {
    return true;
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("429") ||
      message.includes("503") ||
      message.includes("rate limit") ||
      message.includes("too many requests") ||
      message.includes("timeout") ||
      message.includes("econnrefused") ||
      message.includes("econnreset") ||
      message.includes("etimedout") ||
      message.includes("5xx") ||
      message.includes("internal server error") ||
      message.includes("service unavailable") ||
      message.includes("bad gateway")
    );
  }
  return false;
}

/** ROBUST_GENERATE_TEXT_RETRY_OPTIONS configures exponential backoff for transient API failures. */
const ROBUST_GENERATE_TEXT_RETRY_OPTIONS = {
  maxAttempts: 5,
  minTimeout: 1000,
  maxTimeout: 15000,
  multiplier: 2,
};

/**
 * robustGenerateText provides an augmented interface to generateText with automated exponential backoff retries.
 * Only transient errors (rate limits, server errors, network failures) trigger a retry.
 */
async function robustGenerateText(
  generationOptions: Parameters<typeof generateText>[0],
): Promise<Awaited<ReturnType<typeof generateText>>> {
  let lastError: unknown;

  for (let attempt = 0; attempt < ROBUST_GENERATE_TEXT_RETRY_OPTIONS.maxAttempts; attempt++) {
    try {
      return await generateText(generationOptions);
    } catch (error) {
      if (!isTransientError(error)) {
        throw error;
      }
      lastError = error;
      if (attempt < ROBUST_GENERATE_TEXT_RETRY_OPTIONS.maxAttempts - 1) {
        const delay = Math.min(
          ROBUST_GENERATE_TEXT_RETRY_OPTIONS.minTimeout *
            Math.pow(ROBUST_GENERATE_TEXT_RETRY_OPTIONS.multiplier, attempt),
          ROBUST_GENERATE_TEXT_RETRY_OPTIONS.maxTimeout,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * resolveModel instantiates the correct AI SDK model based on the provider prefix in the model identifier.
 */
function resolveModel(modelIdentifier: string, ollamaBaseUrl?: string): BenchmarkModel {
  if (modelIdentifier.startsWith("google:")) {
    const googleProvider = createGoogleGenerativeAI({
      apiKey: Deno.env.get("GEMINI_API_KEY"),
    });
    const cleanModelId = modelIdentifier.slice("google:".length);
    return googleProvider(cleanModelId);
  }

  if (modelIdentifier.startsWith("groq:")) {
    const groqProvider = createGroq({
      apiKey: Deno.env.get("GROQ_API_KEY"),
    });
    const cleanModelId = modelIdentifier.slice("groq:".length);
    return groqProvider(cleanModelId);
  }

  // Default to Ollama, removing optional prefix
  const cleanOllamaBaseUrl = (ollamaBaseUrl ?? Deno.env.get("OLLAMA_BASE_URL") ?? "http://localhost:11434/v1")
    .replace(/\/v1\/?$/, "");
  const ollamaProvider = createOllama({ baseURL: cleanOllamaBaseUrl });
  const cleanModelId = modelIdentifier.startsWith("ollama:")
    ? modelIdentifier.slice("ollama:".length)
    : modelIdentifier;
  return ollamaProvider(cleanModelId);
}

async function buildClient(corpus: string): Promise<Client> {
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
      data: corpus,
    },
  });

  return client;
}

async function answerWithoutTools(
  model: BenchmarkModel,
  question: string,
  corpus: string,
): Promise<AnswerMetrics> {
  const startTime = performance.now();
  const result = await robustGenerateText({
    model,
    prompt:
      `The following data describes a fictional world. Answer ONLY using information present in this data. If the data does not contain the answer, say "I cannot find this information in the provided data." Do not rely on external knowledge. Do not use any tools.\n\nData:\n${corpus}\n\nQuestion: ${question}`,
  });

  const finishTime = performance.now();
  const usage = (result as { usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number } }).usage;

  return {
    answer: result.text.trim(),
    toolCalls: 0,
    toolTrace: [],
    latencyMs: Math.round(finishTime - startTime),
    promptTokens: usage?.promptTokens,
    completionTokens: usage?.completionTokens,
    totalTokens: usage?.totalTokens,
    toolSequence: [],
    redundantToolCalls: 0,
  };
}

async function answerWithTools(
  model: BenchmarkModel,
  client: Client,
  question: string,
  forceTools: boolean,
  debug: boolean,
): Promise<AnswerMetrics> {
  try {
    const tools = createTools(client, {
      sparql: { allowUpdates: false },
    });
    const startTime = performance.now();

    const result = await robustGenerateText({
      model,
      tools,
      system:
        "You are a helpful assistant that answers questions using only the provided tools. If the tools return no data, you must honestly say you cannot find the information rather than making up an answer.",
      toolChoice: forceTools ? "required" : "auto",
      stopWhen: stepCountIs(8),
      prompt:
        `Use the Worlds tools to answer the question. First search for the relevant facts, then use SPARQL to verify the final answer. If the tools return no results, say "I cannot find this information." Do not make up or guess answers.\n\nQuestion: ${question}`,
      onStepFinish: debug
        ? (event) => {
          if (event.toolCalls.length > 0) {
            console.log(JSON.stringify(event.toolCalls, null, 2));
          }
        }
        : undefined,
    });
    const finishTime = performance.now();

    const toolCalls = result.steps.flatMap((step) => step.toolCalls).length;
    const toolTrace = result.steps.flatMap((step) =>
      step.toolCalls.map((toolCall) => JSON.stringify(toolCall))
    );
    const usage = (result as { usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number } }).usage;
    const toolSequence = toolTrace.map(parseToolName).filter((toolName): toolName is string => toolName !== null);

    return {
      answer: result.text.trim(),
      toolCalls,
      toolTrace,
      latencyMs: Math.round(finishTime - startTime),
      promptTokens: usage?.promptTokens,
      completionTokens: usage?.completionTokens,
      totalTokens: usage?.totalTokens,
      toolSequence,
      redundantToolCalls: countRedundantToolCalls(toolTrace),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(
      `    [WARN] answerWithTools failed: ${errorMessage.slice(0, 200)}`,
    );
    return {
      answer: `ERROR: ${errorMessage}`,
      toolCalls: 0,
      toolTrace: [],
      latencyMs: 0,
      toolSequence: [],
      redundantToolCalls: 0,
    };
  }
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
  modelName: string,
  options?: { debug?: boolean },
): Promise<EvalFixtureRunResult> {
  const results: PerModelResult[] = [];
  const rowsByCondition: Record<string, EvalRunRow[]> = {};

  for (const condition of config.conditions) {
    console.log(
      `  Condition: ${condition.name} (${fixture.questions.length} questions × ${config.runs} runs)`,
    );

    const rows: EvalRunRow[] = [];

    for (let runIndex = 1; runIndex <= config.runs; runIndex++) {
      const activeQuestions = config.smokeQuestionLimit !== undefined
        ? fixture.questions.slice(0, config.smokeQuestionLimit)
        : fixture.questions;

      for (const question of activeQuestions) {
        let answerMetrics: AnswerMetrics;
        let toolTrace: string[] | undefined;

        if (condition.mode === "without-tools") {
          answerMetrics = await answerWithoutTools(model, question.question, fixture.corpus);
        } else {
          answerMetrics = await answerWithTools(
            model,
            client!,
            question.question,
            condition.toolChoice === "required",
            options?.debug ?? false,
          );
          const shouldCaptureTrace = options?.debug || question.scoringMode === "llm";
          toolTrace = shouldCaptureTrace ? answerMetrics.toolTrace : undefined;
        }

        const answer = answerMetrics.answer;
        const toolCalls = answerMetrics.toolCalls;

        const evaluationResult = await evaluateQuestion({
          fixture,
          question,
          answer,
          answerMetrics,
          client,
          toolTrace: answerMetrics.toolTrace,
        });

        if (question.expectedTool !== undefined && !question.answer) {
          assessment = {
            correct: toolCorrect ?? false,
            matchKind: toolCorrect ? "exact" : "wrong",
          };
        }

        rows.push({
          questionId: question.id,
          condition: condition.name,
          model: "",
          run: runIndex,
          answer,
          correct: evaluationResult.correct,
          matchKind: evaluationResult.matchKind,
          toolCalls,
          toolTrace: options?.debug ? toolTrace : undefined,
          toolCorrect: evaluationResult.toolCorrect,
          latencyMs: answerMetrics.latencyMs,
          promptTokens: answerMetrics.promptTokens,
          completionTokens: answerMetrics.completionTokens,
          totalTokens: answerMetrics.totalTokens,
          toolSequence: answerMetrics.toolSequence,
          redundantToolCalls: answerMetrics.redundantToolCalls,
          workflowCorrect: evaluationResult.workflowCorrect,
          safetyCorrect: evaluationResult.safetyCorrect,
          searchPrecisionAtK: evaluationResult.searchPrecisionAtK,
          searchRecallAtK: evaluationResult.searchRecallAtK,
          searchMrr: evaluationResult.searchMrr,
        });

        if (options?.debug) {
          printRow(
            condition.name,
            runIndex,
            question.id,
            evaluationResult.correct,
            evaluationResult.matchKind,
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
    const refusalMatches = rows.filter((r) => r.matchKind === "refusal").length;
    const toolUsageCount = rows.filter((r) => r.toolCalls > 0).length;
    const accuracy = totalCount > 0 ? correctCount / totalCount : 0;
    const toolUsageRate = totalCount > 0 ? toolUsageCount / totalCount : 0;

    const toolSelectionAccuracy: number | undefined = (() => {
      const toolRows = rows.filter((r) => r.toolCorrect !== undefined);
      if (toolRows.length === 0) return undefined;
      const correct = toolRows.filter((r) => r.toolCorrect).length;
      return correct / toolRows.length;
    })();

    const unnecessaryToolCalls: number | undefined = (() => {
      const parametricRows = rows.filter((r) => {
        const q = fixture.questions.find((q) => q.id === r.questionId);
        return q?.tags?.includes("parametric") ?? false;
      });
      if (parametricRows.length === 0) return undefined;
      return parametricRows.filter((r) => r.toolCalls > 0).length;
    })();
    const latencyValues = rows.flatMap((row) => row.latencyMs !== undefined ? [row.latencyMs] : []);
    const totalTokenValues = rows.flatMap((row) => row.totalTokens !== undefined ? [row.totalTokens] : []);
    const redundantToolCalls = rows.reduce(
      (accumulator, row) => accumulator + (row.redundantToolCalls ?? 0),
      0,
    );
    const totalToolCalls = rows.reduce((accumulator, row) => accumulator + row.toolCalls, 0);
    const workflowAccuracy: number | undefined = (() => {
      const workflowRows = rows.filter((row) => row.workflowCorrect !== undefined);
      if (workflowRows.length === 0) {
        return undefined;
      }
      const correctWorkflowRows = workflowRows.filter((row) => row.workflowCorrect).length;
      return correctWorkflowRows / workflowRows.length;
    })();
    const safetyAccuracy: number | undefined = (() => {
      const safetyRows = rows.filter((row) => row.safetyCorrect !== undefined);
      if (safetyRows.length === 0) {
        return undefined;
      }
      const correctSafetyRows = safetyRows.filter((row) => row.safetyCorrect).length;
      return correctSafetyRows / safetyRows.length;
    })();
    const precisionValues = rows.flatMap((row) => row.searchPrecisionAtK !== undefined ? [row.searchPrecisionAtK] : []);
    const recallValues = rows.flatMap((row) => row.searchRecallAtK !== undefined ? [row.searchRecallAtK] : []);
    const mrrValues = rows.flatMap((row) => row.searchMrr !== undefined ? [row.searchMrr] : []);
    const classBreakdown: PerQuestionClassSummary[] = fixture.questions
      .flatMap((question) => question.questionClass ? [question.questionClass] : [])
      .filter((questionClass, questionClassIndex, questionClasses) =>
        questionClasses.indexOf(questionClass) === questionClassIndex
      )
      .map((questionClass) => {
        const classQuestionIds = new Set(
          fixture.questions
            .filter((question) => question.questionClass === questionClass)
            .map((question) => question.id),
        );
        const classRows = rows.filter((row) => classQuestionIds.has(row.questionId));
        const classCorrectCount = classRows.filter((row) => row.correct).length;
        const classToolUsageCount = classRows.filter((row) => row.toolCalls > 0).length;
        const classLatencyValues = classRows.flatMap((row) => row.latencyMs !== undefined ? [row.latencyMs] : []);
        const classTokenValues = classRows.flatMap((row) => row.totalTokens !== undefined ? [row.totalTokens] : []);
        const classParametricRows = classRows.filter((row) => {
          const question = fixture.questions.find((candidateQuestion) => candidateQuestion.id === row.questionId);
          return question?.questionClass === "parametric" || question?.tags?.includes("parametric") === true;
        });

        return {
          questionClass,
          accuracy: classRows.length > 0 ? classCorrectCount / classRows.length : 0,
          toolUsageRate: classRows.length > 0 ? classToolUsageCount / classRows.length : 0,
          averageLatencyMs: average(classLatencyValues),
          averageTotalTokens: average(classTokenValues),
          unnecessaryToolCalls: classParametricRows.length > 0
            ? classParametricRows.filter((row) => row.toolCalls > 0).length
            : undefined,
        };
      });

    results.push({
      model: modelName,
      condition: condition.name,
      accuracy,
      toolUsageRate,
      exactMatches,
      aliasMatches,
      wrongMatches,
      refusalMatches: refusalMatches > 0 ? refusalMatches : undefined,
      toolSelectionAccuracy,
      unnecessaryToolCalls,
      averageLatencyMs: average(latencyValues),
      medianLatencyMs: computeMedian(latencyValues),
      averageTotalTokens: average(totalTokenValues),
      totalToolCalls,
      redundantToolCallRate: totalToolCalls > 0 ? redundantToolCalls / totalToolCalls : undefined,
      workflowAccuracy,
      safetyAccuracy,
      averagePrecisionAtK: average(precisionValues),
      averageRecallAtK: average(recallValues),
      averageMrr: average(mrrValues),
      costPerCorrectAnswer: computeCostPerCorrectAnswer(correctCount, totalTokenValues),
      classBreakdown: classBreakdown.length > 0 ? classBreakdown : undefined,
    });

    const refusalStr = refusalMatches > 0
      ? ` refusal:${refusalMatches}`
      : "";
    const toolSelStr = toolSelectionAccuracy !== undefined
      ? ` toolSel:${(toolSelectionAccuracy * 100).toFixed(1)}%`
      : "";
    const unnecessaryStr = unnecessaryToolCalls !== undefined && unnecessaryToolCalls > 0
      ? ` unnecessaryTools:${unnecessaryToolCalls}`
      : "";
    console.log(
      `    Accuracy: ${
        (accuracy * 100).toFixed(1)
      }% (${correctCount}/${totalCount})  Tools used: ${
        (toolUsageRate * 100).toFixed(1)
      }%  (exact:${exactMatches} alias:${aliasMatches} wrong:${wrongMatches}${refusalStr}${toolSelStr}${unnecessaryStr})`,
    );

    rowsByCondition[condition.name] = rows;
  }

  const withoutToolsResult = results.find(
    (r) => r.condition === "without-tools",
  );
  const withoutToolsClassBreakdown = new Map(
    (withoutToolsResult?.classBreakdown ?? []).map((classSummary) => [classSummary.questionClass, classSummary]),
  );
  for (const result of results) {
    if (result === withoutToolsResult) continue;
    if (withoutToolsResult) {
      const delta = result.accuracy - withoutToolsResult.accuracy;
      console.log(
        `    Delta (${result.condition} - without-tools): ${(delta * 100).toFixed(1)}%`,
      );
    }

    if (result.classBreakdown) {
      result.classBreakdown = result.classBreakdown.map((classSummary) => {
        const withoutToolsClassSummary = withoutToolsClassBreakdown.get(classSummary.questionClass);
        return {
          ...classSummary,
          accuracyDeltaVsWithoutTools: withoutToolsClassSummary
            ? classSummary.accuracy - withoutToolsClassSummary.accuracy
            : undefined,
        };
      });
    }
  }

  return {
    perModelResults: results,
    rowsByCondition,
  };
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
      const model = resolveModel(modelEntry.id, config.baseUrl);
      const displayModel = modelEntry.displayName ?? modelEntry.id;
      console.log(`  Model: ${displayModel}`);

      let client: Client | undefined;
      const needsClient = config.conditions.some(
        (c) => c.mode !== "without-tools",
      );
      if (needsClient) {
        console.log("  Building client with corpus...");
        client = await buildClient(fixture.corpus);
      }

      const runOptions = { debug: options?.debug };
      const fixtureRunResult = await runEvalFixture(
        fixture,
        model,
        client,
        config,
        displayModel,
        runOptions,
      );
      const perModelResults = fixtureRunResult.perModelResults;

      for (const result of perModelResults) {
        allResults.push(result);
      }

      const sanitizedModelDir = displayModel.replace(/[:]/g, "-");
      const resultsDir = new URL(
        `../results/${config.name}/${timestamp}/${fixture.name}/${sanitizedModelDir}/`,
        import.meta.url,
      );
      Deno.mkdirSync(resultsDir, { recursive: true });

      await Deno.writeTextFile(
        new URL("summary.json", resultsDir),
        JSON.stringify(perModelResults, null, 2),
      );
      await Deno.writeTextFile(
        new URL("rows.json", resultsDir),
        JSON.stringify(fixtureRunResult.rowsByCondition, null, 2),
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
