import type { ExperimentConfig } from "../evals/types.ts";

const config: ExperimentConfig = {
  name: "recall-huggingface-smoke",
  evals: ["recall"],
  models: [
    {
      id: "huggingface:Qwen/Qwen2.5-7B-Instruct",
      displayName: "qwen2.5-7b",
    },
  ],
  smokeQuestionLimit: 3,
  runs: 1,
  conditions: [
    { name: "without-tools", mode: "without-tools" },
    { name: "with-tools", mode: "with-tools", toolChoice: "auto" },
  ],
};

export default config;
