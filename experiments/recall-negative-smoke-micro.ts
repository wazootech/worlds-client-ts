import type { ExperimentConfig } from "../evals/types.ts";

const config: ExperimentConfig = {
  name: "recall-negative-smoke-micro",
  evals: ["negative-tests"],
  models: [
    { id: "huggingface:Qwen/Qwen2.5-32B-Instruct", displayName: "qwen2.5-32b" },
  ],
  smokeQuestionLimit: 3,
  runs: 1,
  conditions: [
    { name: "with-tools", mode: "with-tools", toolChoice: "required" },
  ],
};

export default config;
