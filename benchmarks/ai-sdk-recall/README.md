# AI SDK recall benchmark

This eval compares the same local Ollama model answering the same factual
questions:

- without Worlds tools
- with the `searchWorld` and `executeSparql` tools from
  `examples/ai-sdk-hello-world`

The benchmark uses `provideLibsql` plus the TensorFlow universal sentence
encoder provider so semantic search is real, not stubbed. The shipped dataset is
an 18-question synthetic atlas so the benchmark stays deterministic and easy to
extend.

## Dataset

The shipped dataset is a small synthetic atlas. It is intentionally non-public
and non-copyrighted so the repo stays clean.

If you want to evaluate a licensed chapter or other external text, convert it to
RDF/Turtle first and point the runner at that corpus.

## Runner

The runner:

- loads the corpus into an in-memory LibSQL client
- creates semantic search with `provideLibsql` +
  `UniversalSentenceEncoderEmbeddingService`
- creates AI SDK tools with `createTools` from the hello-world example
- asks the Ollama model to answer the same questions with and without tools
- repeats each question multiple times so you can compare average accuracy, not
  just one-off luck
- scores answers with phrase-boundary matching so exact answers and aliases are
  counted separately from wrong answers
- can force tool use with `--force-tools`
- can print per-question traces with `--debug`

## Scorer

The scorer uses normalized exact match against the canonical answer(s). This is
the right first scorer because the questions are factual and the answers are
short.

## Run it

```bash
ollama pull qwen2.5:1.5b-instruct
deno run -A benchmarks/ai-sdk-recall/evaluate.ts --model qwen2.5:1.5b-instruct
```

Optional flags:

- `--base-url http://localhost:11434/v1`
- `--model qwen2.5:1.5b-instruct`
- `--runs 3`
- `--output ./results.json`

Other models we used while iterating:

```bash
ollama pull qwen2.5:3b-instruct
ollama pull hermes3:3b
```

Recommended next debug pass:

```bash
deno run -A benchmarks/ai-sdk-recall/evaluate.ts \
  --model qwen2.5:3b-instruct \
  --force-tools \
  --debug
```

## What to look for

The main metric is the accuracy delta:

- `with-tools accuracy - without-tools accuracy`

Also check the tool usage rate:

- if it stays near `0%`, the model is not actually calling Worlds
- if it rises but accuracy stays low, the tool path is being exercised but the
  prompt/model still needs work

If that delta is positive and stable across repeated runs, the tool-assisted
path is doing real work.
