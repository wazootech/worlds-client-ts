export function parseToolName(toolCallTrace: string): string | null {
  try {
    const parsed = JSON.parse(toolCallTrace);
    if (typeof parsed.name === "string") return parsed.name;
    if (typeof parsed.toolName === "string") return parsed.toolName;
  } catch {
    // Ignore parse failures and fall back to null.
  }
  return null;
}

export function countRedundantToolCalls(toolTrace: string[]): number {
  const seenCalls = new Set<string>();
  let redundantCallCount = 0;

  for (const toolCallTrace of toolTrace) {
    if (seenCalls.has(toolCallTrace)) {
      redundantCallCount += 1;
      continue;
    }
    seenCalls.add(toolCallTrace);
  }

  return redundantCallCount;
}

export function extractObservedSearchResultIds(toolTrace: string[]): string[] {
  for (let traceIndex = toolTrace.length - 1; traceIndex >= 0; traceIndex--) {
    try {
      const parsed = JSON.parse(toolTrace[traceIndex]);
      const result = parsed?.result;
      if (result?.success === true && Array.isArray(result.results)) {
        return result.results
          .map((searchResult: { id?: unknown }) => typeof searchResult.id === "string" ? searchResult.id : null)
          .filter((searchResultId: string | null): searchResultId is string => searchResultId !== null);
      }
    } catch {
      // Ignore malformed tool traces.
    }
  }

  return [];
}
