import type { ExperimentConfig } from "../evals/types.ts";

const config: ExperimentConfig = {
  name: "recall-smoke",
  evals: ["recall"],
  models: [
    { id: "mock:recall-smoke", displayName: "mock:recall-smoke" },
  ],
  smokeQuestionLimit: 3,
  runs: 1,
  conditions: [
    { name: "without-tools", mode: "without-tools" },
  ],
};

export default config;
