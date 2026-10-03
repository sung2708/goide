import { describe, expect, it } from "vitest";
import { ownsDebuggerWorkspace } from "./workspace";
import type { DebuggerState } from "../../lib/ipc/types";

describe("debugger workspace display ownership", () => {
  const state = (workspaceRoot: string): DebuggerState => ({ workspaceRoot, sessionActive: true, paused: true, breakpoints: [] });
  it("matches canonical Windows drive and UNC spellings", () => {
    expect(ownsDebuggerWorkspace("C:/work/", state("\\\\?\\C:\\WORK"))).toBe(true);
    expect(ownsDebuggerWorkspace("//server/share/work", state("\\\\?\\UNC\\server\\share\\work"))).toBe(true);
  });
  it("rejects absent roots, foreign roots and case-distinct POSIX roots", () => {
    expect(ownsDebuggerWorkspace(null, state("D:/work"))).toBe(false);
    expect(ownsDebuggerWorkspace("E:/work", state("D:/work"))).toBe(false);
    expect(ownsDebuggerWorkspace("/work", state("/Work"))).toBe(false);
  });
});
