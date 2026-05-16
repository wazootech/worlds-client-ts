import { createClient as createLibsqlClient } from "@libsql/client";
import { generateText, jsonSchema, stepCountIs, tool } from "ai";
import { createHuggingFace } from "@ai-sdk/huggingface";
import { Client } from "@worlds/client";
import { provideLibsql } from "@worlds/client/providers/libsql";
import { UniversalSentenceEncoderEmbeddingService } from "@worlds/client/providers/tfjs-universal-sentence-encoder";
import { evaluateQuestion } from "./evaluators/mod.ts";
import type {
  EvalFixture,
  EvalRunRow,
  ExperimentConfig,
  ExperimentSummary,
  PerModelResult,
  PerQuestionClassSummary,
  RunExperimentOptions,
} from "./types.ts";
import { discoverEvals, loadEval } from "./registry.ts";
import {
  average,
  computeCostPerCorrectAnswer,
  computeMedian,
} from "./runner/metrics.ts";
import { countRedundantToolCalls, parseToolName } from "./runner/tool-trace.ts";
import { getCorpusHash } from "../scripts/utils/hash.ts";
import { join } from "@std/path";
import { translate } from "sparqlalgebrajs";

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

/**
 * parseRetryDelayMs extracts provider-suggested retry delays like "Please retry in 55.5s".
 */
function parseRetryDelayMs(error: unknown): number | undefined {
  if (!(error instanceof Error)) {
    return undefined;
  }

  const retryAfterMatch = error.message.match(/retry in\s+([0-9.]+)s/i);
  if (!retryAfterMatch) {
    return undefined;
  }

  const retryAfterSeconds = Number(retryAfterMatch[1]);
  if (!Number.isFinite(retryAfterSeconds) || retryAfterSeconds <= 0) {
    return undefined;
  }

  return Math.ceil(retryAfterSeconds * 1000);
}

/** ROBUST_GENERATE_TEXT_RETRY_OPTIONS configures exponential backoff for transient API failures. */
const ROBUST_GENERATE_TEXT_RETRY_OPTIONS = {
  maxAttempts: 5,
  minTimeout: 1000,
  maxTimeout: 120000,
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

  for (
    let attempt = 0;
    attempt < ROBUST_GENERATE_TEXT_RETRY_OPTIONS.maxAttempts;
    attempt++
  ) {
    try {
      return await generateText(generationOptions);
    } catch (error) {
      if (!isTransientError(error)) {
        throw error;
      }
      lastError = error;
      if (attempt < ROBUST_GENERATE_TEXT_RETRY_OPTIONS.maxAttempts - 1) {
        const providerSuggestedDelay = parseRetryDelayMs(error);
        const fallbackDelay = Math.min(
          ROBUST_GENERATE_TEXT_RETRY_OPTIONS.minTimeout *
            Math.pow(ROBUST_GENERATE_TEXT_RETRY_OPTIONS.multiplier, attempt),
          ROBUST_GENERATE_TEXT_RETRY_OPTIONS.maxTimeout,
        );
        const delay = Math.min(
          providerSuggestedDelay ?? fallbackDelay,
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
function resolveModel(
  modelIdentifier: string,
): BenchmarkModel {
  if (modelIdentifier.startsWith("huggingface:")) {
    const huggingFaceProvider = createHuggingFace({
      apiKey: Deno.env.get("HF_ACCESS_TOKEN") ??
        Deno.env.get("HUGGINGFACE_API_KEY"),
    });
    const cleanModelId = modelIdentifier.slice("huggingface:".length);
    return huggingFaceProvider(cleanModelId);
  }

  const huggingFaceProvider = createHuggingFace({
    apiKey: Deno.env.get("HF_ACCESS_TOKEN") ??
      Deno.env.get("HUGGINGFACE_API_KEY"),
  });
  return huggingFaceProvider(modelIdentifier);
}

async function buildClient(corpus: string): Promise<Client> {
  const hash = await getCorpusHash(corpus);
  const cacheDir = join(Deno.cwd(), "results", ".cache", "indices");
  await Deno.mkdir(cacheDir, { recursive: true });
  const cachePath = join(cacheDir, `${hash}.db`);

  let databaseUrl = ":memory:";
  let needsImport = true;

  try {
    await Deno.stat(cachePath);
    // Cache exists. Copy to a unique temp file for isolation during this model's run.
    const tempPath = join(cacheDir, `${hash}-${crypto.randomUUID()}.db`);
    await Deno.copyFile(cachePath, tempPath);
    databaseUrl = `file:${tempPath}`;
    needsImport = false;
    console.log(
      `  [Cache] Using pre-indexed LibSQL database (hash: ${hash.slice(0, 8)})`,
    );
  } catch {
    // No cache. We will build it directly at the cache path for the first time.
    databaseUrl = `file:${cachePath}`;
    console.log(
      `  [Cache] Building fresh LibSQL index (hash: ${hash.slice(0, 8)})`,
    );
  }

  const database = createLibsqlClient({ url: databaseUrl });

  const client = new Client(
    await provideLibsql({
      client: database,
      embeddingService: new UniversalSentenceEncoderEmbeddingService(),
      vectorDimensions: 512,
    }),
  );

  if (needsImport) {
    await client.import({
      source: {
        kind: "serialized",
        contentType: "text/turtle",
        data: corpus,
      },
    });
  }

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
  const usage = (result as {
    usage?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    };
  }).usage;

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
    const evalTools = {
      searchWorld: tool({
        description: "Search the knowledge base by keyword.",
        inputSchema: jsonSchema<{ query: string }>({
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Keywords or short text to search for.",
            },
          },
          required: ["query"],
          additionalProperties: false,
        }),
        execute: async ({ query }) => {
          const response = await client.search({ query });
          return {
            results: (response.results ?? []).slice(0, 5).map((result) => ({
              id: result.id,
              subject: result.subject,
              predicate: result.predicate,
              text: result.text,
            })),
          };
        },
      }),
      executeSparql: tool({
        description: "Run a read-only SPARQL SELECT or ASK query.",
        inputSchema: jsonSchema<{ query: string }>({
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "A SPARQL SELECT or ASK query.",
            },
          },
          required: ["query"],
          additionalProperties: false,
        }),
        execute: async ({ query }) => {
          if (/\b(INSERT|DELETE|DROP|CLEAR|LOAD|CREATE)\b/i.test(query)) {
            return {
              success: false,
              error: "SPARQL updates are disabled.",
            };
          }

          try {
            translate(query);
          } catch (error) {
            return {
              success: false,
              error: error instanceof Error
                ? `SPARQL syntax error: ${error.message}`
                : "SPARQL syntax error.",
            };
          }

          const response = await client.sparql({ query });
          return {
            success: true,
            data: response.kind === "void" ? null : response.data,
          };
        },
      }),
    };
    const startTime = performance.now();

    const result = await robustGenerateText({
      model,
      tools: evalTools,
      system:
        "Answer using only the tools. If no tool returns the answer, say you cannot find it.",
      toolChoice: forceTools ? "required" : "auto",
      stopWhen: stepCountIs(4),
      prompt:
        `Use the tools to answer this question. Search first, then verify with SPARQL if needed. If no result exists, say you cannot find it.\n\nQuestion: ${question}`,
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
    const usage = (result as {
      usage?: {
        promptTokens?: number;
        completionTokens?: number;
        totalTokens?: number;
      };
    }).usage;
    const toolSequence = toolTrace.map(parseToolName).filter((
      toolName,
    ): toolName is string => toolName !== null);

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
  options?: RunExperimentOptions,
): Promise<EvalFixtureRunResult> {
  const results: PerModelResult[] = [];
  const rowsByCondition: Record<string, EvalRunRow[]> = {};

  for (const condition of config.conditions) {
    console.log(
      `  Condition: ${condition.name} (${fixture.questions.length} questions × ${config.runs} runs)`,
    );

    const rows: EvalRunRow[] = [];

    for (let runIndex = 1; runIndex <= config.runs; runIndex++) {
      const effectiveQuestionLimit = options?.questionLimitOverride ??
        config.smokeQuestionLimit;
      const activeQuestions = effectiveQuestionLimit !== undefined
        ? fixture.questions.slice(0, effectiveQuestionLimit)
        : fixture.questions;

      for (const question of activeQuestions) {
        let answerMetrics: AnswerMetrics;
        let toolTrace: string[] | undefined;

        if (condition.mode === "without-tools") {
          answerMetrics = await answerWithoutTools(
            model,
            question.question,
            fixture.corpus,
          );
        } else {
          answerMetrics = await answerWithTools(
            model,
            client!,
            question.question,
            condition.toolChoice === "required",
            options?.debug ?? false,
          );
          const shouldCaptureTrace = options?.debug ||
            question.scoringMode === "llm";
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
          options: { judgeModel: config.judgeModel },
        });

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
    const latencyValues = rows.flatMap((row) =>
      row.latencyMs !== undefined ? [row.latencyMs] : []
    );
    const totalTokenValues = rows.flatMap((row) =>
      row.totalTokens !== undefined ? [row.totalTokens] : []
    );
    const redundantToolCalls = rows.reduce(
      (accumulator, row) => accumulator + (row.redundantToolCalls ?? 0),
      0,
    );
    const totalToolCalls = rows.reduce(
      (accumulator, row) => accumulator + row.toolCalls,
      0,
    );
    const workflowAccuracy: number | undefined = (() => {
      const workflowRows = rows.filter((row) =>
        row.workflowCorrect !== undefined
      );
      if (workflowRows.length === 0) {
        return undefined;
      }
      const correctWorkflowRows = workflowRows.filter((row) =>
        row.workflowCorrect
      ).length;
      return correctWorkflowRows / workflowRows.length;
    })();
    const safetyAccuracy: number | undefined = (() => {
      const safetyRows = rows.filter((row) => row.safetyCorrect !== undefined);
      if (safetyRows.length === 0) {
        return undefined;
      }
      const correctSafetyRows =
        safetyRows.filter((row) => row.safetyCorrect).length;
      return correctSafetyRows / safetyRows.length;
    })();
    const precisionValues = rows.flatMap((row) =>
      row.searchPrecisionAtK !== undefined ? [row.searchPrecisionAtK] : []
    );
    const recallValues = rows.flatMap((row) =>
      row.searchRecallAtK !== undefined ? [row.searchRecallAtK] : []
    );
    const mrrValues = rows.flatMap((row) =>
      row.searchMrr !== undefined ? [row.searchMrr] : []
    );
    const classBreakdown: PerQuestionClassSummary[] = fixture.questions
      .flatMap((question) =>
        question.questionClass ? [question.questionClass] : []
      )
      .filter((questionClass, questionClassIndex, questionClasses) =>
        questionClasses.indexOf(questionClass) === questionClassIndex
      )
      .map((questionClass) => {
        const classQuestionIds = new Set(
          fixture.questions
            .filter((question) => question.questionClass === questionClass)
            .map((question) => question.id),
        );
        const classRows = rows.filter((row) =>
          classQuestionIds.has(row.questionId)
        );
        const classCorrectCount = classRows.filter((row) => row.correct).length;
        const classToolUsageCount = classRows.filter((row) =>
          row.toolCalls > 0
        ).length;
        const classLatencyValues = classRows.flatMap((row) =>
          row.latencyMs !== undefined ? [row.latencyMs] : []
        );
        const classTokenValues = classRows.flatMap((row) =>
          row.totalTokens !== undefined ? [row.totalTokens] : []
        );
        const classParametricRows = classRows.filter((row) => {
          const question = fixture.questions.find((candidateQuestion) =>
            candidateQuestion.id === row.questionId
          );
          return question?.questionClass === "parametric" ||
            question?.tags?.includes("parametric") === true;
        });

        return {
          questionClass,
          accuracy: classRows.length > 0
            ? classCorrectCount / classRows.length
            : 0,
          toolUsageRate: classRows.length > 0
            ? classToolUsageCount / classRows.length
            : 0,
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
      redundantToolCallRate: totalToolCalls > 0
        ? redundantToolCalls / totalToolCalls
        : undefined,
      workflowAccuracy,
      safetyAccuracy,
      averagePrecisionAtK: average(precisionValues),
      averageRecallAtK: average(recallValues),
      averageMrr: average(mrrValues),
      costPerCorrectAnswer: computeCostPerCorrectAnswer(
        correctCount,
        totalTokenValues,
      ),
      classBreakdown: classBreakdown.length > 0 ? classBreakdown : undefined,
    });

    const refusalStr = refusalMatches > 0 ? ` refusal:${refusalMatches}` : "";
    const toolSelStr = toolSelectionAccuracy !== undefined
      ? ` toolSel:${(toolSelectionAccuracy * 100).toFixed(1)}%`
      : "";
    const unnecessaryStr =
      unnecessaryToolCalls !== undefined && unnecessaryToolCalls > 0
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
    (withoutToolsResult?.classBreakdown ?? []).map((
      classSummary,
    ) => [classSummary.questionClass, classSummary]),
  );
  for (const result of results) {
    if (result === withoutToolsResult) continue;
    if (withoutToolsResult) {
      const delta = result.accuracy - withoutToolsResult.accuracy;
      console.log(
        `    Delta (${result.condition} - without-tools): ${
          (delta * 100).toFixed(1)
        }%`,
      );
    }

    if (result.classBreakdown) {
      result.classBreakdown = result.classBreakdown.map((classSummary) => {
        const withoutToolsClassSummary = withoutToolsClassBreakdown.get(
          classSummary.questionClass,
        );
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
  options?: RunExperimentOptions,
): Promise<ExperimentSummary> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString().replace(/[:]/g, "-");

  const activeModelEntries = options?.modelFilter?.length
    ? config.models.filter((modelEntry) =>
      options.modelFilter?.includes(modelEntry.id)
    )
    : config.models;
  const activeConditions = options?.conditionFilter?.length
    ? config.conditions.filter((condition) =>
      options.conditionFilter?.includes(condition.name)
    )
    : config.conditions;

  if (activeModelEntries.length === 0) {
    throw new Error("No models matched the requested filter.");
  }

  if (activeConditions.length === 0) {
    throw new Error("No conditions matched the requested filter.");
  }

  const activeConfig: ExperimentConfig = {
    ...config,
    models: activeModelEntries,
    conditions: activeConditions,
  };

  const evalNames =
    activeConfig.evals.length === 1 && activeConfig.evals[0] === "*"
      ? await discoverEvals()
      : activeConfig.evals;

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

    for (const modelEntry of activeConfig.models) {
      const model = resolveModel(modelEntry.id);
      const displayModel = modelEntry.displayName ?? modelEntry.id;
      console.log(`  Model: ${displayModel}`);

      let client: Client | undefined;
      const needsClient = activeConfig.conditions.some(
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
        activeConfig,
        displayModel,
        {
          ...runOptions,
          modelFilter: options?.modelFilter,
          conditionFilter: options?.conditionFilter,
          questionLimitOverride: options?.questionLimitOverride,
        },
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
