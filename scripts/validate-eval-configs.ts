import { translate } from "npm:sparqlalgebrajs";
import { Parser } from "n3";
import { hashQuad } from "../src/client/quad-store/hash-quad.ts";

const VALID_TOOL_NAMES = ["searchWorld", "executeSparql", "importRdf", "exportRdf"];
const VALID_QUESTION_CLASSES = [
  "parametric",
  "graph-fact",
  "workflow",
  "retrieval",
  "adversarial",
  "refusal",
];
const VALID_EXPECTED_MUTATIONS = ["none", "import"];
const VALID_SAFETY_OUTCOMES = ["refuse", "safe-fail", "safe-answer"];
const VALID_EVALUATION_KINDS = ["answer", "workflow", "retrieval", "adversarial"];

function looksLikeLegacySearchKey(value: string): boolean {
  return value.includes("|");
}

const EVAL_DIRS = [
  ...new Set(
    Array.from(Deno.readDirSync(new URL("../evals/", import.meta.url)))
      .filter((entry) => entry.isDirectory)
      .filter((entry) => {
        try {
          Deno.statSync(new URL(`../evals/${entry.name}/EVAL.ts`, import.meta.url));
          return true;
        } catch {
          return false;
        }
      })
      .map((entry) => entry.name),
  ),
].sort();

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
      if (q.questionClass !== undefined && !VALID_QUESTION_CLASSES.includes(q.questionClass)) {
        errors.push(
          error(
            `${evalName}/questions.json`,
            `Question ${q.id} questionClass "${q.questionClass}" not in ${VALID_QUESTION_CLASSES.join(", ")}`,
          ),
        );
      }
      if (q.requiredTools !== undefined && !Array.isArray(q.requiredTools)) {
        errors.push(error(`${evalName}/questions.json`, `Question ${q.id} requiredTools must be an array`));
      }
      if (q.forbiddenTools !== undefined && !Array.isArray(q.forbiddenTools)) {
        errors.push(error(`${evalName}/questions.json`, `Question ${q.id} forbiddenTools must be an array`));
      }
      if (q.expectedToolsInOrder !== undefined && !Array.isArray(q.expectedToolsInOrder)) {
        errors.push(error(`${evalName}/questions.json`, `Question ${q.id} expectedToolsInOrder must be an array`));
      }
      if (q.expectedMutation !== undefined && !VALID_EXPECTED_MUTATIONS.includes(q.expectedMutation)) {
        errors.push(
          error(
            `${evalName}/questions.json`,
            `Question ${q.id} expectedMutation "${q.expectedMutation}" not in ${VALID_EXPECTED_MUTATIONS.join(", ")}`,
          ),
        );
      }
      if (q.expectedGraphStateChecks !== undefined && !Array.isArray(q.expectedGraphStateChecks)) {
        errors.push(error(`${evalName}/questions.json`, `Question ${q.id} expectedGraphStateChecks must be an array`));
      }
      if (q.expectedSafetyOutcome !== undefined && !VALID_SAFETY_OUTCOMES.includes(q.expectedSafetyOutcome)) {
        errors.push(
          error(
            `${evalName}/questions.json`,
            `Question ${q.id} expectedSafetyOutcome "${q.expectedSafetyOutcome}" not in ${VALID_SAFETY_OUTCOMES.join(", ")}`,
          ),
        );
      }
      if (q.expectedErrorSubstring !== undefined && typeof q.expectedErrorSubstring !== "string") {
        errors.push(error(`${evalName}/questions.json`, `Question ${q.id} expectedErrorSubstring must be a string`));
      }
      if (q.expectedSearchResultIds !== undefined) {
        if (!Array.isArray(q.expectedSearchResultIds) || q.expectedSearchResultIds.length === 0) {
          errors.push(
            error(`${evalName}/questions.json`, `Question ${q.id} expectedSearchResultIds must be a non-empty array`),
          );
        }
      }
      if (q.searchEvaluationK !== undefined) {
        if (typeof q.searchEvaluationK !== "number" || q.searchEvaluationK <= 0) {
          errors.push(error(`${evalName}/questions.json`, `Question ${q.id} searchEvaluationK must be a positive number`));
        }
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
    if (!fixture || !VALID_EVALUATION_KINDS.includes(fixture.evaluationKind)) {
      errors.push(error(`${evalName}/EVAL.ts`, `Must export default with evaluationKind in ${VALID_EVALUATION_KINDS.join(", ")}`));
    }
    if (!Array.isArray(fixture.questions)) {
      errors.push(error(`${evalName}/EVAL.ts`, "Must export default with questions array"));
    }
    if (typeof fixture.corpus !== "string") {
      errors.push(error(`${evalName}/EVAL.ts`, "Must export default with corpus string"));
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
        if (!["without-tools", "with-tools"].includes(condition.mode)) {
          errors.push(error(`experiments/${entry.name}`, `Condition ${condition.name} must declare mode "without-tools" or "with-tools"`));
        }
        if (condition.mode === "with-tools" && condition.toolChoice !== undefined && !["auto", "required"].includes(condition.toolChoice)) {
          errors.push(error(`experiments/${entry.name}`, `Condition ${condition.name} toolChoice must be "auto" or "required"`));
        }
      }
    } catch (cause) {
      errors.push(error(`experiments/${entry.name}`, `Cannot import: ${cause}`));
    }
  }

  return errors;
}

async function validateSearchQualityFixture(): Promise<ValidationError[]> {
  const errors: ValidationError[] = [];
  const corpusUrl = new URL("../evals/search-quality/corpus.ttl", import.meta.url);
  const questionsUrl = new URL("../evals/search-quality/questions.json", import.meta.url);

  try {
    const corpusText = await Deno.readTextFile(corpusUrl);
    const parser = new Parser({ format: "text/turtle" });
    const quads = parser.parse(corpusText);
    const validHashIds = new Set<string>();
    for (const quad of quads) {
      validHashIds.add(await hashQuad(quad));
    }

    const questions = JSON.parse(await Deno.readTextFile(questionsUrl)) as Array<Record<string, unknown>>;
    for (const question of questions) {
      const questionId = typeof question.id === "string" ? question.id : "<unknown>";
      const expectedSearchResultIds = Array.isArray(question.expectedSearchResultIds)
        ? question.expectedSearchResultIds
        : [];

      for (const expectedSearchResultId of expectedSearchResultIds) {
        if (typeof expectedSearchResultId !== "string") {
          errors.push(error("search-quality/questions.json", `Question ${questionId} has non-string expectedSearchResultIds entry`));
          continue;
        }
        if (looksLikeLegacySearchKey(expectedSearchResultId)) {
          errors.push(error("search-quality/questions.json", `Question ${questionId} still contains legacy search key ${expectedSearchResultId}`));
          continue;
        }
        if (!validHashIds.has(expectedSearchResultId)) {
          errors.push(error("search-quality/questions.json", `Question ${questionId} references search result id not present in corpus: ${expectedSearchResultId}`));
        }
      }
    }
  } catch (cause) {
    errors.push(error("search-quality", `Semantic validation failed: ${cause}`));
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
    if (evalName === "search-quality") {
      evalErrors.push(...await validateSearchQualityFixture());
    }

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
