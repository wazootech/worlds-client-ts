import type { ExperimentConfig } from "../evals/types.ts";

const config: ExperimentConfig = {
  name: "recall-gemini",
  evals: ["recall"],
  models: [{ id: "google:gemini-2.5-flash", displayName: "gemini-2.5-flash" }],
  runs: 3,
  conditions: [
    { name: "without-tools", mode: "without-tools" },
    { name: "with-tools", mode: "with-tools", toolChoice: "auto" },
  ],
};

export default config;
