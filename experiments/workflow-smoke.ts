import type { ExperimentConfig } from "../evals/types.ts";

const config: ExperimentConfig = {
  name: "workflow-smoke",
  evals: ["workflows"],
  models: [
    { id: "groq:meta-llama/llama-4-scout-17b-16e-instruct", displayName: "llama4-scout" },
  ],
  smokeQuestionLimit: 3,
  runs: 1,
  conditions: [
    { name: "with-tools-auto", mode: "with-tools", toolChoice: "auto" },
    { name: "with-tools-required", mode: "with-tools", toolChoice: "required" },
  ],
};

export default config;
