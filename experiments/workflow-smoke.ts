import type { ExperimentConfig } from "../evals/types.ts";

const config: ExperimentConfig = {
  name: "workflow-smoke",
  evals: ["workflows"],
  models: [
    {
      id: "huggingface:Qwen/Qwen2.5-14B-Instruct",
      displayName: "qwen2.5-14b",
    },
  ],
  smokeQuestionLimit: 3,
  runs: 1,
  conditions: [
    { name: "with-tools-auto", mode: "with-tools", toolChoice: "auto" },
    { name: "with-tools-required", mode: "with-tools", toolChoice: "required" },
  ],
};

export default config;
