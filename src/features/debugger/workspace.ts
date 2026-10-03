import type { DebuggerState } from "../../lib/ipc/types";

// This comparison only controls display. Native canonical paths and owner UUIDs
// independently authorize every operation.
const normalized = (path: string) => {
  const value = path.replace(/^\\\\\?\\UNC\\/i, "\\\\").replace(/^\\\\\?\\/, "").replace(/\\/g, "/").replace(/\/+$/, "");
  return /^[a-z]:\//i.test(value) || value.startsWith("//") ? value.toLowerCase() : value;
};
export const ownsDebuggerWorkspace = (root: string | null, state: DebuggerState | null) =>
  !!root && !!state?.workspaceRoot && normalized(root) === normalized(state.workspaceRoot);
