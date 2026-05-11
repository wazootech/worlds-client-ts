import type * as rdfjs from "@rdfjs/types";
import type {
  ExportRequest,
  ExportResponse,
  ImportRequest,
  ImportResponse,
  QuadStoreInterface,
} from "./interface.ts";
import type { Patch, PatchListener } from "./patch.ts";
import { parseQuads } from "./quad-store.ts";

/**
 * PatchQueue manages a synchronized, in-memory FIFO buffer of store changes waiting to be flushed.
 */
export class PatchQueue {
  private patches: Patch[] = [];

  public push(patch: Patch): void {
    this.patches.push(patch);
  }

  public flush(): Patch[] {
    const data = this.patches;
    this.patches = [];
    return data;
  }

  public get length(): number {
    return this.patches.length;
  }
}

/**
 * BufferedQuadStore provides transaction-aware reactive synchronizations by wrapping
 * an existing QuadStoreInterface implementation.
 *
 * It resolves incoming payloads to in-memory collections FIRST, records them into a PatchQueue,
 * delegates to the physical store, and triggers automatic downstream flushes after each complete operation.
 */
export class BufferedQuadStore implements QuadStoreInterface {
  private readonly queue = new PatchQueue();

  constructor(
    private readonly inner: QuadStoreInterface,
    private readonly listeners: PatchListener[] = [],
  ) {}

  public async import(request: ImportRequest): Promise<ImportResponse> {
    const insertions = await this.resolveQuads(request.source);
    let deletions: rdfjs.Quad[] = [];

    // 1. Capture historical snapshot if conducting full structural swap
    if (request.mode === "replace") {
      const snapshot = await this.inner.export({ format: { kind: "quads" } });
      if (snapshot.kind === "quads") {
        deletions = snapshot.quads;
      }
    }

    // 2. Record transactions into our buffered queue
    this.queue.push({ insertions, deletions });

    // 3. Delegate work to underlying standard store using finalized quads directly (fast)
    const response = await this.inner.import({
      mode: request.mode,
      source: { kind: "quads", quads: insertions },
    });

    // 4. Execute buffered synchronization post-operation commitment
    await this.flush();

    return response;
  }

  public async export(request: ExportRequest): Promise<ExportResponse> {
    return this.inner.export(request);
  }

  /**
   * flush aggregates the pending patch queue and notifies downstream listeners atomically.
   */
  public async flush(): Promise<void> {
    const batches = this.queue.flush();
    if (batches.length === 0 || this.listeners.length === 0) return;

    // Dispatch aggregate batch to all registered listeners concurrently
    await Promise.all(
      batches.map((patch) =>
        Promise.all(this.listeners.map((fn) => fn(patch)))
      ),
    );
  }

  /**
   * resolveQuads unifies heterogeneous ingestion payload formats into a standard Quad array.
   */
  private async resolveQuads(
    source: ImportRequest["source"],
  ): Promise<rdfjs.Quad[]> {
    if (source.kind === "quads") {
      return Array.from(source.quads);
    }
    if (source.kind === "dataset") {
      return Array.from(source.dataset);
    }
    if (source.kind === "serialized") {
      const stream = parseQuads(source.data, source.contentType);
      const quads: rdfjs.Quad[] = [];
      
      await new Promise<void>((resolve, reject) => {
        stream.on("data", (q) => quads.push(q as rdfjs.Quad));
        stream.on("end", resolve);
        stream.on("error", reject);
      });
      return quads;
    }
    throw new Error(`Unsupported source kind resolved: ${(source as any).kind}`);
  }
}
