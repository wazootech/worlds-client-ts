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
      id: "huggingface:Qwen/Qwen2.5-14B-Instruct",
      displayName: "qwen2.5-14b",
    },
    { id: "huggingface:Qwen/Qwen2.5-32B-Instruct", displayName: "qwen2.5-32b" },
  ],
  runs: 1,
  conditions: [
    { name: "without-tools", mode: "without-tools" },
    { name: "with-tools-auto", mode: "with-tools", toolChoice: "auto" },
    { name: "with-tools-required", mode: "with-tools", toolChoice: "required" },
  ],
};

export default config;
