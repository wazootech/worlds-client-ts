import type { Client } from "@worlds/client";

export async function runGraphStateChecks(
  client: Client | undefined,
  graphStateChecks: string[],
): Promise<boolean[]> {
  const graphCheckResults: boolean[] = [];

  for (const graphStateCheck of graphStateChecks) {
    try {
      const graphCheckResponse = await client?.sparql({
        query: graphStateCheck,
      });
      const graphCheckSucceeded = graphCheckResponse?.kind === "ask"
        ? graphCheckResponse.data.boolean
        : false;
      graphCheckResults.push(graphCheckSucceeded);
    } catch {
      graphCheckResults.push(false);
    }
  }

  return graphCheckResults;
}
