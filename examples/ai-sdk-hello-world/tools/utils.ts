/**
 * ToolResult is a standardized wrapper for AI SDK tool execution results.
 */
export type ToolResult<T> =
  | ({ success: true } & T)
  | { success: false; error: string };

/**
 * wrapToolExecution provides a unified error handling wrapper for asynchronous
 * tool logic. It ensures consistent success/failure reporting and prevents
 * unhandled exceptions from crashing the agent context.
 *
 * @param execution The asynchronous logic to execute.
 * @returns A standardized ToolResult.
 */
export async function wrapToolExecution<T>(
  execution: () => Promise<T>,
): Promise<ToolResult<T>> {
  try {
    const result = await execution();
    return { success: true, ...result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
