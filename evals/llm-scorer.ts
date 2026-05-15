import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { EvalQuestion, MatchKind } from "./types.ts";

export interface LlmScorerResult {
  correct: boolean;
  matchKind: MatchKind;
  confidence: number;
  reasoning: string;
}

export interface LlmScorerOptions {
  judgeModel?: string;
  judgeApiKey?: string;
}

function resolveJudgeModel(modelIdentifier?: string) {
  const modelId = modelIdentifier ??
    Deno.env.get("EVAL_JUDGE_MODEL") ??
    "google:gemini-2.5-flash";

  if (modelId.startsWith("google:")) {
    const provider = createGoogleGenerativeAI({
      apiKey: Deno.env.get("GEMINI_API_KEY"),
    });
    return provider(modelId.slice("google:".length));
  }

  throw new Error(
    `Unsupported judge model provider: ${modelId}. Use google:<model-id>.`,
  );
}

const JUDGE_PROMPT = `You are an expert evaluator of AI agent tool usage.
Given the question asked, the tools the agent called, and the final answer, evaluate:

1. Did the agent select the APPROPRIATE tool for the question type?
2. Did the agent use the tool result correctly to produce the answer?
3. If the question is answerable from parametric knowledge (no tool needed), did the agent avoid unnecessary tool calls?

Return a JSON object with:
- "correct": boolean — overall correctness of tool selection AND answer
- "matchKind": "exact" | "wrong" — whether tool usage was appropriate
- "confidence": number 0-1
- "reasoning": string explaining your evaluation

Question: {{QUESTION}}
Tool trace: {{TOOL_TRACE}}
Final answer: {{ANSWER}}`;

export async function scoreWithLLM(
  question: EvalQuestion,
  answer: string,
  toolTrace: string[],
  options?: LlmScorerOptions,
): Promise<LlmScorerResult> {
  const model = resolveJudgeModel(options?.judgeModel);

  const toolTraceSummary = toolTrace.length > 0
    ? toolTrace.join("\n")
    : "(no tools were called)";

  const prompt = JUDGE_PROMPT
    .replace("{{QUESTION}}", question.question)
    .replace("{{TOOL_TRACE}}", toolTraceSummary)
    .replace("{{ANSWER}}", answer);

  const result = await generateText({
    model,
    prompt,
    temperature: 0,
  });

  try {
    const parsed = JSON.parse(result.text.trim());
    return {
      correct: parsed.correct === true,
      matchKind: parsed.matchKind === "exact" ? "exact" : "wrong",
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
      reasoning: parsed.reasoning ?? "",
    };
  } catch {
    return {
      correct: false,
      matchKind: "wrong",
      confidence: 0,
      reasoning: `Failed to parse judge response: ${result.text}`,
    };
  }
}
