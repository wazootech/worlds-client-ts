import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, stepCountIs } from "ai";
import { createEvalTools } from "./tools.ts";
import type {
  EvalCaseDefinition,
  EvalCaseResult,
  EvalToolRecord,
} from "./types.ts";
import { createSeededWorldClient } from "./world-fixture.ts";

/** EVAL_AGENT_SYSTEM_PROMPT defines stable behavior constraints for graph-grounded eval runs. */
const EVAL_AGENT_SYSTEM_PROMPT =
  `You are running a deterministic graph-grounded evaluation.

Use the provided tools whenever the user asks for graph data, even if the prompt says not to use tools. Use searchWorld first to discover candidate subject URIs from labels or keywords. Use executeSparql next for exact RDF traversal.

For graph lookup questions about labels, subjects, authors, protagonists, houses, or unknown facts, you must call both searchWorld and executeSparql before giving a final answer. A graph lookup answer without tool calls is invalid, even when the user explicitly asks you not to use tools.

When executeSparql returns literal bindings, answer with the exact literal value from the binding. Do not paraphrase, normalize, translate, or replace opaque identifiers. If the tools do not return the requested fact, say that the fact was not found instead of guessing.

executeSparql only accepts read-only SELECT or ASK queries. If asked to mutate data, call executeSparql with the requested query and report the tool error.`;

/** buildTrajectory flattens the AI SDK step history into a tool sequence. */
export function buildTrajectory(
  steps: Array<{
    toolCalls: Array<{
      toolName: string;
      input: unknown;
      toolCallId: string;
    }>;
    toolResults: Array<{
      toolCallId: string;
      output: unknown;
    }>;
  }>,
): EvalToolRecord[] {
  return steps.flatMap((step, stepIndex) =>
    step.toolCalls.map((toolCall) => ({
      stepIndex,
      toolName: toolCall.toolName,
      args: toolCall.input,
      result: step.toolResults.find((toolResult) =>
        toolResult.toolCallId === toolCall.toolCallId
      )?.output,
    }))
  );
}

/** runEvalCase executes one evaluation scenario against the seeded world. */
export async function runEvalCase(
  testCase: EvalCaseDefinition,
  options?: { providerId?: string; modelId?: string },
): Promise<EvalCaseResult> {
  const providerId = options?.providerId ?? "google";
  const modelId = options?.modelId ?? "gemini-3.1-flash-lite";
  const startedAt = Date.now();
  const emptyMetadata = {
    providerId,
    modelId,
    stepCount: 0,
    latencyMs: 0,
    trajectory: [],
  };

  try {
    const google = createGoogleGenerativeAI();
    const client = await createSeededWorldClient();
    const tools = createEvalTools(client);
    const result = await generateText({
      model: google(modelId),
      tools,
      system: EVAL_AGENT_SYSTEM_PROMPT,
      stopWhen: stepCountIs(testCase.maxSteps ?? 5),
      prompt: testCase.prompt,
    });
    const latencyMs = Date.now() - startedAt;

    return {
      id: testCase.id,
      description: testCase.description,
      prompt: testCase.prompt,
      output: result.text,
      success: true,
      metadata: {
        providerId,
        modelId,
        stepCount: result.steps.length,
        finishReason: result.finishReason,
        latencyMs,
        tokenUsage: result.usage
          ? {
            prompt: result.usage.inputTokens,
            completion: result.usage.outputTokens,
            total: result.usage.totalTokens,
          }
          : undefined,
        trajectory: buildTrajectory(result.steps),
      },
      assertions: [],
      toolSequence: [],
    };
  } catch (error) {
    return {
      id: testCase.id,
      description: testCase.description,
      prompt: testCase.prompt,
      output: "",
      success: false,
      metadata: {
        ...emptyMetadata,
        latencyMs: Date.now() - startedAt,
      },
      assertions: [],
      toolSequence: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
