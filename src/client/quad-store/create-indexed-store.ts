import type { Store } from "n3";
import type * as rdfjs from "@rdfjs/types";
import type { PatchQueueInterface } from "./patch-queue-interface.ts";
import { PatchQueue } from "./patch-queue.ts";

/**
 * createIndexedStore installs a non-invasive JavaScript Proxy wrapper around a concrete
 * N3 Store. It transparently captures memory modifications (adds, removes, imports)
 * and stages them for background synchronization.
 *
 * IMPORTANT: It enforces strict idempotency guards, ensuring that ONLY actual factual delta
 * mutations are captured. Redundant operations that do not change graph state are ignored.
 */
export function createIndexedStore(target: Store): {
  store: Store;
  queue: PatchQueueInterface;
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
          // Skip operation if the statement is already fully resident
          if (base.has(quad)) {
            // deno-lint-ignore no-explicit-any
            return (base as any)[prop].apply(base, [quad]);
          }
          // deno-lint-ignore no-explicit-any
          const result = (base as any)[prop].apply(base, [quad]);
          queue.push({ insertions: [quad], deletions: [] });
          return result;
        };
      }

      if (prop === "addQuads") {
        return (quads: rdfjs.Quad[]) => {
          // Filter only those which actually introduce new information
          const novelQuads = quads.filter((q) => !base.has(q));
          const result = base.addQuads(quads);
          if (novelQuads.length > 0) {
            queue.push({ insertions: novelQuads, deletions: [] });
          }
          return result;
        };
      }

      // 2. Capture specific Quad removal hooks
      if (prop === "removeQuad" || prop === "remove") {
        return (quad: rdfjs.Quad) => {
          // Skip if deletion is already true
          if (!base.has(quad)) {
            // deno-lint-ignore no-explicit-any
            return (base as any)[prop].apply(base, [quad]);
          }
          // deno-lint-ignore no-explicit-any
          const result = (base as any)[prop].apply(base, [quad]);
          queue.push({ insertions: [], deletions: [quad] });
          return result;
        };
      }

      if (prop === "removeQuads") {
        return (quads: rdfjs.Quad[]) => {
          const actualDeletions = quads.filter((q) => base.has(q));
          // deno-lint-ignore no-explicit-any
          const result = (base as any)[prop].apply(base, [quads]);
          if (actualDeletions.length > 0) {
            queue.push({ insertions: [], deletions: actualDeletions });
          }
          return result;
        };
      }

      // 3. Proxy the low-level Stream import consumed by Comunica
      if (prop === "import") {
        return (stream: rdfjs.Stream<rdfjs.Quad>) => {
          // Attach passive tap observer to inbound data flow
          stream.on("data", (quad: rdfjs.Quad) => {
            // Check existing storage prior to insertion processing
            if (!base.has(quad)) {
              queue.push({ insertions: [quad], deletions: [] });
            }
          });

          // Delegate stream into raw store engine
          // deno-lint-ignore no-explicit-any
          return base.import(stream as any);
        };
      }

      // 4. Capture removeMatches (used by replace-mode imports)
      if (prop === "removeMatches") {
        return (
          subject?: rdfjs.Term | null,
          predicate?: rdfjs.Term | null,
          object?: rdfjs.Term | null,
          graph?: rdfjs.Term | null,
        ): rdfjs.Stream<rdfjs.Quad> => {
          const toDelete: rdfjs.Quad[] = [];
          // Save original match and replace with intercepting wrapper
          // deno-lint-ignore no-explicit-any
          const origMatch = (base as any).match;
          // deno-lint-ignore no-explicit-any
          (base as any).match = function (
            s?: rdfjs.Term | null,
            p?: rdfjs.Term | null,
            o?: rdfjs.Term | null,
            g?: rdfjs.Term | null,
          ) {
            // deno-lint-ignore no-explicit-any
            const stream = (origMatch as any).call(this, s, p, o, g);
            // deno-lint-ignore no-explicit-any
            (stream as any).on("data", (q: rdfjs.Quad) => toDelete.push(q));
            return stream;
          };
          try {
            // Get the removal stream from the base store (base.match is now our wrapper)
            // deno-lint-ignore no-explicit-any
            const removalStream = (base as any).removeMatches.call(
              base,
              subject,
              predicate,
              object,
              graph,
            );
            // Also listen to the removal stream itself
            // deno-lint-ignore no-explicit-any
            (removalStream as any).on(
              "data",
              (q: rdfjs.Quad) => toDelete.push(q),
            );
            // Queue deletions once the removal stream finishes
            // deno-lint-ignore no-explicit-any
            (removalStream as any).on("end", () => {
              if (toDelete.length) {
                queue.push({ insertions: [], deletions: toDelete });
              }
            });
            return removalStream;
          } finally {
            // Always restore original match
            // deno-lint-ignore no-explicit-any
            (base as any).match = origMatch;
          }
        };
      }

      // 5. Fallback: bind other functions back to parent
      return value.bind(base);
    },
    has(base, prop) {
      // Intercept the has trap so Comunica's internal quad-existence checks
      // (e.g. during delete-if-absent logic) route through the proxy correctly.
      if (prop === "removeMatches") return true;
      return Reflect.has(base, prop);
    },
  }) as Store;

  return {
    store: proxiedStore,
    queue,
  };
}
