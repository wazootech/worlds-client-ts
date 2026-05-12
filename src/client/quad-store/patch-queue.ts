import type { Patch, PatchQueueInterface } from "./patch-queue-interface.ts";

/**
 * PatchQueue provides simple, atomic buffered storage for pending transaction diffs.
 */
export class PatchQueue implements PatchQueueInterface {
  private patches: Patch[] = [];

  public push(patch: Patch): void {
    this.patches.push(patch);
  }

  public flush(): Patch[] {
    const data = this.patches;
    this.patches = [];
    return data;
  }
}
