import type { Store } from "n3";
import type * as rdfjs from "@rdfjs/types";
import type { Patch } from "./patch.ts";

/**
 * PatchQueue provides simple, atomic buffered storage for pending transaction diffs.
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
}

/**
 * createIndexedStore installs a non-invasive JavaScript Proxy wrapper around a concrete
 * N3 Store. It transparently captures memory modifications (adds, removes, imports)
 * and stages them for background synchronization.
 */
export function createIndexedStore(target: Store): {
  store: Store;
  queue: PatchQueue;
} {
  const queue = new PatchQueue();

  const proxiedStore = new Proxy(target, {
    get(base, prop, receiver) {
      const value = Reflect.get(base, prop, receiver);

      // If property accessed is not a handler function, return raw value immediately.
      if (typeof value !== "function") {
        return value;
      }

      // 1. Capture specific Quad insertion hooks
      if (prop === "addQuad" || prop === "add") {
        return (quad: rdfjs.Quad) => {
          // deno-lint-ignore no-explicit-any
          const result = (base as any)[prop].apply(base, [quad]);
          queue.push({ insertions: [quad], deletions: [] });
          return result;
        };
      }

      if (prop === "addQuads") {
        return (quads: rdfjs.Quad[]) => {
          const result = base.addQuads(quads);
          queue.push({ insertions: quads, deletions: [] });
          return result;
        };
      }

      // 2. Capture specific Quad removal hooks
      if (prop === "removeQuad" || prop === "remove") {
        return (quad: rdfjs.Quad) => {
          // deno-lint-ignore no-explicit-any
          const result = (base as any)[prop].apply(base, [quad]);
          queue.push({ insertions: [], deletions: [quad] });
          return result;
        };
      }

      if (prop === "removeQuads") {
        return (quads: rdfjs.Quad[]) => {
          // deno-lint-ignore no-explicit-any
          const result = (base as any)[prop].apply(base, [quads]);
          queue.push({ insertions: [], deletions: quads });
          return result;
        };
      }

      // 3. Proxy the low-level Stream import consumed by Comunica
      if (prop === "import") {
        return (stream: rdfjs.Stream<rdfjs.Quad>) => {
          // Attach passive tap observer to inbound data flow
          stream.on("data", (quad: rdfjs.Quad) => {
            queue.push({ insertions: [quad], deletions: [] });
          });
          
          // Delegate stream into raw store engine
          // deno-lint-ignore no-explicit-any
          return base.import(stream as any);
        };
      }

      // 4. Fallback: bind other functions (like match, removeMatches) back to parent
      return value.bind(base);
    },
  }) as Store;

  return {
    store: proxiedStore,
    queue,
  };
}
