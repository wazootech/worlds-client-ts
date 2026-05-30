import { walk } from "@std/fs/walk";
import { extname } from "@std/path/extname";

/** textSourceExtensions lists repository text extensions that must be UTF-8. */
const textSourceExtensions = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".json",
  ".md",
  ".mdc",
  ".yml",
  ".yaml",
  ".sql",
  ".toml",
]);

/** skipPathPattern excludes vendored and generated dependency trees from scans. */
const skipPathPattern = /(?:^|[\\/])(?:node_modules|\.git|vendor)(?:[\\/]|$)/;

/** encodingIssue describes a source file saved with an invalid Windows encoding. */
interface EncodingIssue {
  path: string;
  kind: "utf16-le-bom" | "utf16-be-bom" | "utf16-le";
}

/** detectEncodingIssue returns an encoding violation when bytes are not UTF-8 text. */
function detectEncodingIssue(
  path: string,
  bytes: Uint8Array,
): EncodingIssue | undefined {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { path, kind: "utf16-le-bom" };
  }

  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { path, kind: "utf16-be-bom" };
  }

  const sampleLength = Math.min(bytes.length, 512);
  let nullByteCount = 0;

  for (let index = 0; index < sampleLength; index += 1) {
    if (bytes[index] === 0x00) {
      nullByteCount += 1;
    }
  }

  if (nullByteCount >= 4) {
    return { path, kind: "utf16-le" };
  }

  return undefined;
}

/** decodeUtf16Source reads UTF-16 source bytes into a JavaScript string. */
function decodeUtf16Source(
  bytes: Uint8Array,
  kind: EncodingIssue["kind"],
): string {
  if (kind === "utf16-be-bom") {
    return new TextDecoder("utf-16be").decode(bytes);
  }

  const utf16LeBytes = kind === "utf16-le-bom" ? bytes.slice(2) : bytes;
  return new TextDecoder("utf-16le").decode(utf16LeBytes);
}

/** collectEncodingIssues scans repository text sources for UTF-16 encodings. */
async function collectEncodingIssues(): Promise<EncodingIssue[]> {
  const issues: EncodingIssue[] = [];

  for await (const entry of walk(".", { includeDirs: false })) {
    if (skipPathPattern.test(entry.path)) {
      continue;
    }

    const extension = extname(entry.path);
    if (!textSourceExtensions.has(extension)) {
      continue;
    }

    const bytes = await Deno.readFile(entry.path);
    const issue = detectEncodingIssue(entry.path, bytes);
    if (issue !== undefined) {
      issues.push(issue);
    }
  }

  return issues;
}

/** formatEncodingIssueMessage renders a human-readable encoding failure line. */
function formatEncodingIssueMessage(issue: EncodingIssue): string {
  switch (issue.kind) {
    case "utf16-le-bom":
      return `${issue.path}: UTF-16 LE BOM (save as UTF-8)`;
    case "utf16-be-bom":
      return `${issue.path}: UTF-16 BE BOM (save as UTF-8)`;
    case "utf16-le":
      return `${issue.path}: UTF-16 LE without BOM (save as UTF-8)`;
  }
}

/** repairEncodingIssue rewrites a UTF-16 source file as UTF-8 on disk. */
async function repairEncodingIssue(issue: EncodingIssue): Promise<void> {
  const bytes = await Deno.readFile(issue.path);
  const content = decodeUtf16Source(bytes, issue.kind);
  await Deno.writeTextFile(issue.path, content);
}

const shouldRepair = Deno.args.includes("--fix");

const issues = await collectEncodingIssues();

if (issues.length === 0) {
  console.log("OK: all scanned text sources are UTF-8");
  Deno.exit(0);
}

if (shouldRepair) {
  for (const issue of issues) {
    await repairEncodingIssue(issue);
    console.log(`fixed: ${issue.path}`);
  }
  Deno.exit(0);
}

console.error(
  "Invalid source encoding detected. Text sources must be UTF-8 (LF line endings).\n" +
    "On Windows, Cursor Write/StrReplace can save UTF-16; run encoding:fix before deno fmt.\n" +
    "Repair locally with: deno task encoding:fix\n",
);

for (const issue of issues) {
  console.error(formatEncodingIssueMessage(issue));
}

Deno.exit(1);
