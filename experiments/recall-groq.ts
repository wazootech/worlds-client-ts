import type { ExperimentConfig } from "../evals/types.ts";

const config: ExperimentConfig = {
  name: "recall-groq",
  evals: ["recall"],
  models: [
    { id: "groq:llama-3.1-8b-instant", displayName: "llama3.1-8b" },
    { id: "groq:groq/compound", displayName: "groq-compound" },
    { id: "groq:meta-llama/llama-4-scout-17b-16e-instruct", displayName: "llama4-scout" },
    { id: "groq:qwen/qwen3-32b", displayName: "qwen3-32b" },
    { id: "groq:openai/gpt-oss-120b", displayName: "gpt-oss-120b" },
    { id: "groq:llama-3.3-70b-versatile", displayName: "llama3.3-70b" },
  ],
  runs: 3,
  conditions: [
    { name: "without-tools", mode: "without-tools" },
    { name: "with-tools", mode: "with-tools", toolChoice: "auto" },
  ],
};

export default config;
