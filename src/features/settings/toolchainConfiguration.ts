import { configureToolchainPaths } from "../../lib/ipc/client";
import type { ApiResponse, ToolPaths } from "../../lib/ipc/types";
let tail: Promise<void> = Promise.resolve();
/** Keep native path changes in request order; obsolete queued preferences never apply. */
export function configureInOrder(paths: ToolPaths, isCurrent: () => boolean): Promise<ApiResponse<ToolPaths> | null> {
  const operation = tail.then(() => isCurrent() ? configureToolchainPaths(paths) : null);
  tail = operation.then(() => undefined, () => undefined);
  return operation;
}
