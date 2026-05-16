import { generateText } from "ai";
import { createGroq } from "@ai-sdk/groq";
import { parseArgs } from "@std/cli/parse-args";
import type { EvalQuestion } from "../evals/types.ts";

const USAGE = `
Usage: deno run -A scripts/generate-synthetic-evals.ts --corpus <path> --output <path> [options]

Options:
  --count <num>       Number of questions to generate (default: 10)
  --examples <path>   Path to existing questions.json for style/format examples
  --model <id>        Groq model ID (default: llama-3.3-70b-versatile)
`;

async function main() {
  const parsed = parseArgs(Deno.args, {
    string: ["corpus", "output", "count", "examples", "model"],
    default: {
      count: "10",
      model: "llama-3.3-70b-versatile",
    },
  });

  if (!parsed.corpus || !parsed.output) {
    console.log(USAGE);
    Deno.exit(1);
  }

  const corpus = await Deno.readTextFile(parsed.corpus);
  const count = parseInt(parsed.count);
  const examples: EvalQuestion[] = parsed.examples
    ? JSON.parse(await Deno.readTextFile(parsed.examples)).slice(0, 5)
    : [];

  const groq = createGroq({
    apiKey: Deno.env.get("GROQ_API_KEY"),
  });

  console.log(
    `Generating ${count} synthetic questions using ${parsed.model}...`,
  );

  const prompt = `
You are an expert at creating benchmarks for Knowledge Graph RAG systems.
Based on the following Turtle RDF corpus, generate ${count} high-quality evaluation questions.

### Rules:
1. Some questions should be direct fact retrieval (e.g., "What is the capital of X?").
2. Some questions should be multi-hop (e.g., "What is the capital of the country that borders Y?").
3. Include some "refusal" cases where the information is NOT in the corpus.
4. Ensure the answers are exactly as they appear in the data or labels.
5. Return ONLY a valid JSON array of objects.

### Object Schema:
{
  "id": "string (unique)",
  "question": "string",
  "answer": "string",
  "aliases": ["string"],
  "expectedOutcome": "factoid" | "refusal",
  "tags": ["string"]
}

### Examples of Format:
${JSON.stringify(examples, null, 2)}

### Corpus:
${corpus}

### JSON Output:
`;

  const result = await generateText({
    model: groq(parsed.model),
    prompt,
    temperature: 0.1,
  });

  const jsonMatch = result.text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error(`Could not find JSON array in response: ${result.text}`);
  }
  const questions = JSON.parse(jsonMatch[0]);

  const existingData =
    parsed.output && (await Deno.stat(parsed.output).catch(() => null))
      ? JSON.parse(await Deno.readTextFile(parsed.output))
      : [];

  const updatedData = [...existingData, ...questions];

  await Deno.writeTextFile(parsed.output, JSON.stringify(updatedData, null, 2));

  console.log(
    `Successfully generated and saved ${questions.length} questions to ${parsed.output}`,
  );
}

if (import.meta.main) {
  main();
}
