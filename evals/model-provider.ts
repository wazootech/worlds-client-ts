import { createHuggingFace } from "@ai-sdk/huggingface";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";

type BenchmarkModel = Parameters<typeof generateText>[0]["model"];

const routerBaseUrl = Deno.env.get("NINE_ROUTER_BASE_URL") ??
  Deno.env.get("OPENROUTER_BASE_URL") ??
  "http://localhost:20128/v1";

const routerApiKey = Deno.env.get("NINE_ROUTER_API_KEY") ??
  Deno.env.get("OPENROUTER_API_KEY") ??
  "";

const routerProvider = createOpenAICompatible({
  name: "9router",
  baseURL: routerBaseUrl,
  ...(routerApiKey ? { apiKey: routerApiKey } : {}),
  includeUsage: true,
});

const legacyHuggingFaceProvider = createHuggingFace({
  apiKey: Deno.env.get("HF_ACCESS_TOKEN") ??
    Deno.env.get("HUGGINGFACE_API_KEY"),
});

function resolveRouterModel(modelIdentifier: string): BenchmarkModel {
  if (modelIdentifier.startsWith("openrouter:")) {
    return routerProvider(modelIdentifier.slice("openrouter:".length));
  }

  if (modelIdentifier.startsWith("router:")) {
    return routerProvider(modelIdentifier.slice("router:".length));
  }

  if (modelIdentifier.startsWith("9router:")) {
    return routerProvider(modelIdentifier.slice("9router:".length));
  }

  return routerProvider(modelIdentifier);
}

function resolveLegacyModel(modelIdentifier: string): BenchmarkModel {
  if (modelIdentifier.startsWith("huggingface:")) {
    return legacyHuggingFaceProvider(
      modelIdentifier.slice("huggingface:".length),
    );
  }

  return resolveRouterModel(modelIdentifier);
}

export function resolveBenchmarkModel(
  modelIdentifier: string,
): BenchmarkModel {
  return resolveLegacyModel(modelIdentifier);
}

export function resolveJudgeModel(
  modelIdentifier?: string,
): BenchmarkModel {
  const judgeModelIdentifier = modelIdentifier ??
    Deno.env.get("EVAL_JUDGE_MODEL") ??
    "cc/claude-sonnet-4-6";
  return resolveLegacyModel(judgeModelIdentifier);
}
