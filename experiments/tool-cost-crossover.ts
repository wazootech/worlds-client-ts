import type { ExperimentConfig } from "../evals/types.ts";

const config: ExperimentConfig = {
  name: "tool-cost-crossover",
  evals: [
    "recall",
    "negative-tests",
    "tool-selection",
    "workflows",
    "adversarial",
  ],
  models: [
    {
      id: "groq:meta-llama/llama-4-scout-17b-16e-instruct",
      displayName: "llama4-scout",
    },
    { id: "groq:qwen/qwen3-32b", displayName: "qwen3-32b" },
  ],
  runs: 1,
  conditions: [
    { name: "without-tools", mode: "without-tools" },
    { name: "with-tools-auto", mode: "with-tools", toolChoice: "auto" },
    { name: "with-tools-required", mode: "with-tools", toolChoice: "required" },
  ],
};

export default config;
