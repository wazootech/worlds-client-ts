import type { ExperimentConfig } from "../evals/types.ts";

const config: ExperimentConfig = {
  name: "adversarial-smoke",
  evals: ["adversarial"],
  models: [
    { id: "groq:llama-3.3-70b-versatile", displayName: "llama3.3-70b" },
  ],
  smokeQuestionLimit: 3,
  runs: 1,
  conditions: [
    { name: "with-tools-auto", mode: "with-tools", toolChoice: "auto" },
    { name: "with-tools-required", mode: "with-tools", toolChoice: "required" },
  ],
};

export default config;
