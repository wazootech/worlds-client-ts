import type { ExperimentConfig } from "../evals/types.ts";

const config: ExperimentConfig = {
  name: "recall-smoke",
  evals: ["recall"],
  models: [{ id: "qwen2.5:0.5b-instruct", displayName: "qwen0.5b" }],
  runs: 1,
  conditions: [
    { name: "without-tools" },
    { name: "with-tools" },
  ],
  baseUrl: Deno.env.get("OLLAMA_BASE_URL") ?? "http://localhost:11434/v1",
};

export default config;
