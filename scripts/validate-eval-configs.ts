import { translate } from "npm:sparqlalgebrajs";

const VALID_TOOL_NAMES = ["searchWorld", "executeSparql", "importRdf", "exportRdf"];

const EVAL_DIRS = ["recall", "negative-tests", "tool-selection"];

interface ValidationError {
  file: string;
  message: string;
}

function error(file: string, message: string): ValidationError {
  return { file, message };
}

async function validateEvalQuestions(evalName: string): Promise<ValidationError[]> {
  const errors: ValidationError[] = [];
  const questionsUrl = new URL(`../evals/${evalName}/questions.json`, import.meta.url);

  let questions: Record<string, unknown>[];
  try {
    const raw = Deno.readTextFileSync(questionsUrl);
    questions = JSON.parse(raw);
  } catch (cause) {
    errors.push(error(`${evalName}/questions.json`, `Cannot read/parse: ${cause}`));
    return errors;
  }

  if (!Array.isArray(questions) || questions.length === 0) {
    errors.push(error(`${evalName}/questions.json`, "Must be a non-empty array"));
    return errors;
  }

  const ids = new Set<string>();
  for (const q of questions) {
    if (typeof q.id !== "string" || !q.id) {
      errors.push(error(`${evalName}/questions.json`, "Question missing string id"));
      continue;
    }
    if (ids.has(q.id)) {
      errors.push(error(`${evalName}/questions.json`, `Duplicate id: ${q.id}`));
    }
    ids.add(q.id);

    if (typeof q.question !== "string" || !q.question) {
      errors.push(error(`${evalName}/questions.json`, `Question ${q.id} missing question text`));
    }
    if (typeof q.answer !== "string") {
      errors.push(error(`${evalName}/questions.json`, `Question ${q.id} missing answer string`));
    }
    if (q.aliases !== undefined && !Array.isArray(q.aliases)) {
      errors.push(error(`${evalName}/questions.json`, `Question ${q.id} aliases must be an array`));
    }
    if (q.tags !== undefined && !Array.isArray(q.tags)) {
      errors.push(error(`${evalName}/questions.json`, `Question ${q.id} tags must be an array`));
    }

    if (evalName === "negative-tests") {
      if (q.expectedOutcome !== "refusal") {
        errors.push(error(`${evalName}/questions.json`, `Question ${q.id} must have expectedOutcome "refusal"`));
      }
      if (!Array.isArray(q.tags) || !q.tags.includes("refusal")) {
        errors.push(error(`${evalName}/questions.json`, `Question ${q.id} must be tagged "refusal"`));
      }
    }

    if (evalName === "tool-selection") {
      if (!Object.prototype.hasOwnProperty.call(q, "expectedTool")) {
        errors.push(error(`${evalName}/questions.json`, `Question ${q.id} missing expectedTool`));
      } else if (q.expectedTool !== null && !VALID_TOOL_NAMES.includes(q.expectedTool as string)) {
        errors.push(error(`${evalName}/questions.json`, `Question ${q.id} expectedTool "${q.expectedTool}" not in ${VALID_TOOL_NAMES.join(", ")}`));
      }

      if (q.scoringMode !== undefined && !["code", "llm"].includes(q.scoringMode as string)) {
        errors.push(error(`${evalName}/questions.json`, `Question ${q.id} scoringMode must be "code" or "llm"`));
      }
    }
  }

  return errors;
}

async function validateCorpusFile(evalName: string): Promise<ValidationError[]> {
  const errors: ValidationError[] = [];
  const corpusPath = evalName === "negative-tests"
    ? `../evals/recall/corpus.ttl`
    : `../evals/${evalName}/corpus.ttl`;
  const corpusUrl = new URL(corpusPath, import.meta.url);

  try {
    const content = Deno.readTextFileSync(corpusUrl);
    if (!content.trim()) {
      errors.push(error(`${evalName}/corpus.ttl`, "Corpus file is empty"));
    }
  } catch {
    errors.push(error(`${evalName}/corpus.ttl`, "Corpus file not found or unreadable"));
  }

  return errors;
}

async function validateEvalFixture(evalName: string): Promise<ValidationError[]> {
  const errors: ValidationError[] = [];
  const evalUrl = new URL(`../evals/${evalName}/EVAL.ts`, import.meta.url);

  try {
    const mod = await import(evalUrl.href);
    const fixture = mod.default;
    if (!fixture || typeof fixture.name !== "string") {
      errors.push(error(`${evalName}/EVAL.ts`, "Must export default with string name"));
    }
    if (!Array.isArray(fixture.questions)) {
      errors.push(error(`${evalName}/EVAL.ts`, "Must export default with questions array"));
    }
    if (typeof fixture.corpus !== "string") {
      errors.push(error(`${evalName}/EVAL.ts`, "Must export default with corpus string"));
    }
    if (typeof fixture.score !== "function") {
      errors.push(error(`${evalName}/EVAL.ts`, "Must export default with score function"));
    }
  } catch (cause) {
    errors.push(error(`${evalName}/EVAL.ts`, `Cannot import: ${cause}`));
  }

  return errors;
}

async function validateExperimentConfigs(): Promise<ValidationError[]> {
  const errors: ValidationError[] = [];
  const experimentsUrl = new URL("../experiments/", import.meta.url);

  for await (const entry of Deno.readDir(experimentsUrl)) {
    if (!entry.isFile || !entry.name.endsWith(".ts")) continue;

    const configUrl = new URL(entry.name, experimentsUrl);
    try {
      const mod = await import(configUrl.href);
      const config = mod.default;

      if (!config || typeof config.name !== "string") {
        errors.push(error(`experiments/${entry.name}`, "Must export default with string name"));
        continue;
      }
      if (!Array.isArray(config.evals)) {
        errors.push(error(`experiments/${entry.name}`, "evals must be an array"));
      } else if (!(config.evals.length === 1 && config.evals[0] === "*")) {
        for (const evalName of config.evals) {
          if (!EVAL_DIRS.includes(evalName)) {
            errors.push(error(`experiments/${entry.name}`, `References unknown eval "${evalName}" (known: ${EVAL_DIRS.join(", ")})`));
          }
        }
      }
      if (!Array.isArray(config.models) || config.models.length === 0) {
        errors.push(error(`experiments/${entry.name}`, "Must have at least one model"));
      }
      if (typeof config.runs !== "number" || config.runs < 1) {
        errors.push(error(`experiments/${entry.name}`, "runs must be a positive number"));
      }
      if (!Array.isArray(config.conditions) || config.conditions.length === 0) {
        errors.push(error(`experiments/${entry.name}`, "Must have at least one condition"));
      }
      for (const condition of config.conditions) {
        if (typeof condition.name !== "string") {
          errors.push(error(`experiments/${entry.name}`, "Condition missing name"));
        }
      }
    } catch (cause) {
      errors.push(error(`experiments/${entry.name}`, `Cannot import: ${cause}`));
    }
  }

  return errors;
}

async function main(): Promise<void> {
  console.log("--- Validating eval configs ---\n");

  const allErrors: ValidationError[] = [];

  for (const evalName of EVAL_DIRS) {
    console.log(`\n  Eval: ${evalName}`);
    const evalErrors: ValidationError[] = [];

    evalErrors.push(...await validateEvalFixture(evalName));
    evalErrors.push(...await validateEvalQuestions(evalName));
    evalErrors.push(...await validateCorpusFile(evalName));

    for (const err of evalErrors) {
      console.log(`    FAIL  ${err.file}: ${err.message}`);
    }
    if (evalErrors.length === 0) {
      console.log("    OK");
    }
    allErrors.push(...evalErrors);
  }

  console.log(`\n  Experiment configs:`);
  const expErrors = await validateExperimentConfigs();
  for (const err of expErrors) {
    console.log(`    FAIL  ${err.file}: ${err.message}`);
  }
  if (expErrors.length === 0) {
    console.log("    OK");
  }
  allErrors.push(...expErrors);

  console.log(`\n--- Summary: ${allErrors.length === 0 ? "ALL VALID" : `${allErrors.length} error(s) found`} ---`);

  if (allErrors.length > 0) {
    Deno.exit(1);
  }
}

if (import.meta.main) {
  await main();
}
