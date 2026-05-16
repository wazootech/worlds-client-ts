import type { ExperimentConfig } from "../evals/types.ts";

const config: ExperimentConfig = {
  name: "recall-negative-smoke",
  evals: ["negative-tests"],
  models: [
    { id: "groq:llama-3.1-8b-instant", displayName: "llama3.1-8b" },
    {
      id: "groq:meta-llama/llama-4-scout-17b-16e-instruct",
      displayName: "llama4-scout",
    },
    { id: "groq:qwen/qwen3-32b", displayName: "qwen3-32b" },
    { id: "groq:llama-3.3-70b-versatile", displayName: "llama3.3-70b" },
  ],
  smokeQuestionLimit: 3,
  runs: 1,
  conditions: [
    { name: "without-tools", mode: "without-tools" },
    { name: "with-tools", mode: "with-tools", toolChoice: "auto" },
  ],
};

export default config;
