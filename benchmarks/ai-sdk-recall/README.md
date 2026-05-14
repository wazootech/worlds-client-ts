# AI SDK recall benchmark

This eval compares the same Gemini model answering the same factual questions:

- without Worlds tools
- with the `searchWorld` and `executeSparql` tools from `examples/ai-sdk-hello-world`

The benchmark uses `provideLibsql` plus the TensorFlow universal sentence encoder provider so semantic search is real, not stubbed.
The LibSQL search path now strips common stopwords before FTS lookup so retrieval keys off content words instead of filler words.

## Dataset

The shipped dataset is a small synthetic atlas. It is intentionally non-public and non-copyrighted so the repo stays clean.

If you want to evaluate a licensed chapter or other external text, convert it to RDF/Turtle first and point the runner at that corpus.

## Runner

The runner:

- loads the corpus into an in-memory LibSQL client
- creates semantic search with `provideLibsql` + `UniversalSentenceEncoderEmbeddingService`
- creates AI SDK tools with `createTools` from the hello-world example
- asks the Gemini model to answer the same questions with and without tools
- repeats each question multiple times so you can compare average accuracy, not just one-off luck

## Scorer

The scorer uses normalized exact match against the canonical answer(s).
This is the right first scorer because the questions are factual and the answers are short.

## Run it

```bash
export GEMINI_API_KEY=...
deno run -A benchmarks/ai-sdk-recall/evaluate.ts
```

Optional flags:

- `--model gemini-2.5-flash`
- `--runs 3`
- `--output ./results.json`

## What to look for

The main metric is the accuracy delta:

- `with-tools accuracy - without-tools accuracy`

If that delta is positive and stable across repeated runs, the tool-assisted path is doing real work.
