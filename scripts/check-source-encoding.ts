/**
 * checkSourceEncoding verifies repository text sources use UTF-8 (not UTF-16).
 */
import { extname, fromFileUrl, relative } from "@std/path";
import { walk } from "@std/fs/walk";

/** TEXT_EXTENSIONS lists file extensions treated as UTF-8 text sources. */
const TEXT_EXTENSIONS = new Set([
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
  ".editorconfig",
]);

/** SKIP_DIR_NAMES excludes generated or vendor trees from encoding scans. */
const SKIP_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  "vendor",
  "models",
  ".cache",
  "docs",
]);

/** EncodingIssue records a file that failed UTF-8 validation. */
interface EncodingIssue {
  /** path is repository-relative. */
  path: string;
  /** reason describes the detected encoding problem. */
  reason: string;
}

/**
 * detectEncodingIssue returns a problem description when bytes are not UTF-8 text.
 */
function detectEncodingIssue(bytes: Uint8Array): string | null {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return "UTF-16 LE BOM";
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return "UTF-16 BE BOM";
  }
  if (bytes.length >= 2 && bytes[0] === 0 && bytes[2] === 0) {
    return "UTF-16-like null-byte pattern";
  }
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return null;
  } catch {
    return "invalid UTF-8";
  }
}

/**
 * decodeUtf16Le converts UTF-16 LE bytes (with optional BOM) to a JavaScript string.
 */
function decodeUtf16Le(bytes: Uint8Array): string {
  const hasBom = bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe;
  const payload = hasBom ? bytes.slice(2) : bytes;
  return new TextDecoder("utf-16le").decode(payload);
}

/**
 * shouldScanFile returns true for tracked-style text sources under the repo root.
 */
function shouldScanFile(path: string): boolean {
  const extension = extname(path).toLowerCase();
  if (extension === ".editorconfig" || path.endsWith(".editorconfig")) {
    return true;
  }
  return TEXT_EXTENSIONS.has(extension);
}

/**
 * shouldSkipPath returns true when a path segment is under an excluded directory.
 */
function shouldSkipPath(relativePath: string): boolean {
  const segments = relativePath.split("/");
  return segments.some((segment) => SKIP_DIR_NAMES.has(segment));
}

const fixMode = Deno.args.includes("--fix");
const repoRootUrl = new URL("../", import.meta.url);
const repoRootPath = fromFileUrl(repoRootUrl);
const issues: EncodingIssue[] = [];

for await (
  const entry of walk(repoRootPath, {
    includeDirs: false,
    skip: [
      /[/\\]node_modules[/\\]/,
      /[/\\]\.git[/\\]/,
      /[/\\]vendor[/\\]/,
      /[/\\]models[/\\]/,
      /[/\\]\.cache[/\\]/,
      /[/\\]docs[/\\]/,
    ],
  })
) {
  const relativePath = relative(repoRootPath, entry.path).replaceAll("\\", "/");
  if (shouldSkipPath(relativePath)) {
    continue;
  }
  if (!shouldScanFile(relativePath)) {
    continue;
  }

  const bytes = await Deno.readFile(entry.path);
  const issue = detectEncodingIssue(bytes);
  if (issue === null) {
    continue;
  }

  if (fixMode) {
    const decoded = issue.startsWith("UTF-16")
      ? decodeUtf16Le(bytes)
      : new TextDecoder("utf-8").decode(bytes);
    const normalized = decoded.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
    await Deno.writeTextFile(
      entry.path,
      normalized.endsWith("\n") ? normalized : `${normalized}\n`,
    );
    console.log(`[encoding] fixed ${relativePath} (${issue})`);
    continue;
  }

  issues.push({ path: relativePath, reason: issue });
}

if (issues.length > 0) {
  console.error("[encoding] check failed:");
  for (const issue of issues) {
    console.error(`  ${issue.path}: ${issue.reason}`);
  }
  Deno.exit(1);
}

console.log(
  `[encoding] check passed (${fixMode ? "fix mode" : "verify mode"}).`,
);
