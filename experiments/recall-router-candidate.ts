import type { ExperimentConfig } from "../evals/types.ts";

const config: ExperimentConfig = {
  name: "recall-router-candidate",
  evals: ["recall"],
  models: [
    { id: "cc/claude-sonnet-4-6", displayName: "claude-sonnet-4-6" },
  ],
  runs: 1,
  conditions: [
    { name: "without-tools", mode: "without-tools" },
    { name: "with-tools", mode: "with-tools", toolChoice: "auto" },
  ],
};

export default config;
