import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, stepCountIs } from "ai";
import { createEvalTools } from "./tools.ts";
import type {
  EvalCaseDefinition,
  EvalCaseResult,
  EvalToolRecord,
} from "./types.ts";
import { createSeededWorldClient } from "./world-fixture.ts";

/** buildTrajectory flattens the AI SDK step history into a tool sequence. */
function buildTrajectory(
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
  const modelId = options?.modelId ?? "gemini-2.5-flash";
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
      stopWhen: stepCountIs(testCase.maxSteps ?? 5),
      prompt: testCase.prompt,
    });
    const latencyMs = Date.now() - startedAt;

    return {
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
    };
  } catch (error) {
    return {
      description: testCase.description,
      prompt: testCase.prompt,
      output: "",
      success: false,
      metadata: {
        ...emptyMetadata,
        latencyMs: Date.now() - startedAt,
      },
      assertions: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
