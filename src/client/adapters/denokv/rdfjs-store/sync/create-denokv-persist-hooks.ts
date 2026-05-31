import type { CommitHandler } from "@/client/quad-store/mod.ts";
import type { SearchIndexOnImport } from "@/client/search-index/mod.ts";
import {
  commitPatchToDenokv,
  type CommitPatchToDenokvOptions,
} from "./commit-patch-to-denokv.ts";

export interface DenokvPersistHooks {
  commitHandler: CommitHandler;
  beforeImport: () => void;
  afterImport: () => Promise<void>;
}

export interface DenokvPersistHooksOptions extends CommitPatchToDenokvOptions {
  searchIndexOnImport?: SearchIndexOnImport;
  reindex?: () => Promise<void>;
}

export function createDenokvPersistHooks(
  dependencies: DenokvPersistHooksOptions,
): DenokvPersistHooks {
  const searchIndexOnImport = dependencies.searchIndexOnImport ?? "incremental";

  return {
    commitHandler: async (patch, context) => {
      await commitPatchToDenokv(patch, dependencies, context);
    },
    beforeImport: () => {},
    afterImport: async (): Promise<void> => {
      if (searchIndexOnImport === "deferred" && dependencies.reindex) {
        await dependencies.reindex();
      }
    },
  };
}
