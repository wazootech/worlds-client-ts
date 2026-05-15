import type { ExperimentConfig } from "../evals/types.ts";

const config: ExperimentConfig = {
  name: "recall-negative-smoke-micro",
  evals: ["negative-tests"],
  models: [
    { id: "groq:llama-3.1-8b-instant", displayName: "llama3.1-8b" },
  ],
  smokeQuestionLimit: 3,
  runs: 1,
  conditions: [
    { name: "with-tools", mode: "with-tools", toolChoice: "auto" },
  ],
};

export default config;
