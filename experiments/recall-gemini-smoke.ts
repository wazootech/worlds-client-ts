import type { ExperimentConfig } from "../evals/types.ts";

const config: ExperimentConfig = {
  name: "recall-gemini-smoke",
  evals: ["recall"],
  models: [
    { id: "google:gemini-2.0-flash", displayName: "gemini-2.0-flash" },
    { id: "google:gemini-2.5-flash", displayName: "gemini-2.5-flash" },
  ],
  smokeQuestionLimit: 3,
  runs: 1,
  conditions: [
    { name: "without-tools", mode: "without-tools" },
    { name: "with-tools", mode: "with-tools", toolChoice: "auto" },
  ],
};

export default config;
