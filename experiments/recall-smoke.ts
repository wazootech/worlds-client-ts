import type { ExperimentConfig } from "../evals/types.ts";

const config: ExperimentConfig = {
  name: "recall-smoke",
  evals: ["recall"],
  models: [
    { id: "huggingface:Qwen/Qwen2.5-7B-Instruct", displayName: "qwen2.5-7b" },
    {
      id: "huggingface:Qwen/Qwen2.5-14B-Instruct",
      displayName: "qwen2.5-14b",
    },
    { id: "huggingface:Qwen/Qwen2.5-32B-Instruct", displayName: "qwen2.5-32b" },
    { id: "huggingface:Qwen/Qwen2.5-32B-Instruct", displayName: "qwen2.5-32b" },
  ],
  smokeQuestionLimit: 3,
  runs: 1,
  conditions: [
    { name: "without-tools", mode: "without-tools" },
    { name: "with-tools", mode: "with-tools", toolChoice: "auto" },
  ],
};

export default config;
