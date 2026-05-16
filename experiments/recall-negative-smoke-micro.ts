import type { ExperimentConfig } from "../evals/types.ts";

const config: ExperimentConfig = {
  name: "recall-negative-smoke-micro",
  evals: ["negative-tests"],
  models: [
    { id: "groq:llama-3.3-70b-versatile", displayName: "llama3.3-70b" },
  ],
  smokeQuestionLimit: 3,
  runs: 1,
  conditions: [
    { name: "with-tools", mode: "with-tools", toolChoice: "required" },
  ],
};

export default config;
