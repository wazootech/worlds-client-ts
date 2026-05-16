import type { ExperimentConfig } from "../evals/types.ts";

const config: ExperimentConfig = {
  name: "recall-codex-smoke",
  evals: ["recall"],
  models: [
    { id: "openai:gpt-5.4-mini", displayName: "gpt-5.4-mini" },
    { id: "openai:gpt-4o-mini", displayName: "gpt-4o-mini" },
  ],
  smokeQuestionLimit: 3,
  runs: 1,
  conditions: [
    { name: "without-tools", mode: "without-tools" },
    { name: "with-tools", mode: "with-tools", toolChoice: "auto" },
  ],
};

export default config;
