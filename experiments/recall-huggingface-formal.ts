import type { ExperimentConfig } from "../evals/types.ts";

const config: ExperimentConfig = {
  name: "recall-huggingface-formal",
  evals: ["recall"],
  models: [
    { id: "huggingface:Qwen/Qwen2.5-14B-Instruct", displayName: "qwen2.5-14b" },
  ],
  runs: 3,
  judgeModel: "huggingface:Qwen/Qwen2.5-14B-Instruct",
  conditions: [
    { name: "without-tools", mode: "without-tools" },
    { name: "with-tools", mode: "with-tools", toolChoice: "auto" },
  ],
};

export default config;
