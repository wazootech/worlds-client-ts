import type { ExperimentConfig } from "../evals/types.ts";

const config: ExperimentConfig = {
  name: "recall-router-formal",
  evals: ["recall"],
  models: [
    { id: "cc/claude-sonnet-4-6", displayName: "claude-sonnet-4-6" },
  ],
  runs: 3,
  judgeModel: "cc/claude-sonnet-4-6",
  conditions: [
    { name: "without-tools", mode: "without-tools" },
    { name: "with-tools", mode: "with-tools", toolChoice: "auto" },
  ],
};

export default config;
