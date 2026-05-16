import type { ExperimentConfig } from "../evals/types.ts";

const config: ExperimentConfig = {
  name: "adversarial-smoke",
  evals: ["adversarial"],
  models: [
    { id: "huggingface:Qwen/Qwen2.5-7B-Instruct", displayName: "qwen2.5-7b" },
  ],
  smokeQuestionLimit: 5,
  runs: 1,
  conditions: [
    { name: "with-tools", mode: "with-tools", toolChoice: "auto" },
  ],
};

export default config;
