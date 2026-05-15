import type { ExperimentConfig } from "../evals/types.ts";

const config: ExperimentConfig = {
  name: "recall-comparison",
  evals: ["recall"],
  models: [{ id: "qwen2.5:3b" }],
  runs: 1,
  conditions: [
    { name: "without-tools" },
    { name: "with-tools" },
  ],
};

export default config;
