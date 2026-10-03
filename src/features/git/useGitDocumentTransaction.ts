import type { MutableRefObject } from "react";
import type { GitTransaction } from "./useSourceControl";

type Params = {
  root: MutableRefObject<string | null>;
  lock: MutableRefObject<boolean>;
  mutation: MutableRefObject<boolean>;
  preserve: () => Promise<boolean>;
  isPreserved: () => boolean;
  setBusy: (busy: boolean) => void;
  canChangeFiles?: () => boolean;
};

export function useGitDocumentTransaction(params: Params): GitTransaction {
  return async (operation, saveBuffer = false, changesFiles = false) => {
    if (changesFiles && params.canChangeFiles && !params.canChangeFiles()) throw new Error("Stop the active run/debug session before changing project files.");
    const root = params.root.current;
    if (!root || params.lock.current) throw new Error("Wait for the current document/Git operation to finish.");
    params.lock.current = true; params.setBusy(true);
    try {
      // Staging explicitly includes current saved edits. Unstage and commit
      // never save or stage the working buffer as an invisible side effect.
      if (saveBuffer && (!(await params.preserve()) || !params.isPreserved())) {
        throw new Error("Save failed or the buffer changed. Your edits remain open; save and retry the operation.");
      }
      if (params.root.current !== root) throw new Error("Workspace changed; retry in the current repository.");
      params.mutation.current = true;
      await operation();
      return true;
    } finally {
      params.mutation.current = false; params.lock.current = false; params.setBusy(false);
    }
  };
}
