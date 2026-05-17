import type { ExperimentConfig } from "../evals/types.ts";

const config: ExperimentConfig = {
  name: "search-quality-smoke",
  evals: ["search-quality"],
  models: [
    { id: "huggingface:Qwen/Qwen2.5-32B-Instruct", displayName: "qwen2.5-32b" },
  ],
  smokeQuestionLimit: 3,
  runs: 1,
  conditions: [
    { name: "with-tools-auto", mode: "with-tools", toolChoice: "auto" },
    { name: "with-tools-required", mode: "with-tools", toolChoice: "required" },
  ],
};

export default config;
