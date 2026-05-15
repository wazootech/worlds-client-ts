import type { ExperimentConfig } from "../evals/types.ts";

const config: ExperimentConfig = {
  name: "search-quality-smoke",
  evals: ["search-quality"],
  models: [
    { id: "groq:qwen/qwen3-32b", displayName: "qwen3-32b" },
  ],
  smokeQuestionLimit: 3,
  runs: 1,
  conditions: [
    { name: "with-tools-auto", mode: "with-tools", toolChoice: "auto" },
    { name: "with-tools-required", mode: "with-tools", toolChoice: "required" },
  ],
};

export default config;
