import type { ExperimentConfig } from "../evals/types.ts";

const config: ExperimentConfig = {
  name: "recall-comparison",
  evals: ["recall"],
  models: [{ id: "qwen2.5:3b-instruct" }],
  runs: 3,
  conditions: [
    { name: "without-tools" },
    { name: "with-tools" },
  ],
  baseUrl: Deno.env.get("OLLAMA_BASE_URL") ?? "http://localhost:11434/v1",
};

export default config;
