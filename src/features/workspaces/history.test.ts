import { describe, expect, it, vi } from "vitest";
import { DocumentSession } from "../documents/DocumentSession";
import { WorkspaceHistory, WORKSPACE_HISTORY_KEY } from "./history";

function storage(raw: string | null = null) {
  return { getItem: () => raw, setItem: (_key: string, value: string) => { raw = value; }, raw: () => raw! };
}
function document(root = "C:/project") { const session = new DocumentSession(); session.reset(root); session.open("main.go", "disk-secret"); return session; }
describe("workspace navigation history", () => {
  it("stores navigation without dirty buffers, baseline or runtime state", () => {
    const disk = storage(); const history = new WorkspaceHistory(disk); const session = document();
    session.edit(session.active!.id, "unsaved-secret"); history.remember(session.snapshot());
    expect(disk.raw()).not.toMatch(/secret|baseline|diagnostic|process|readOnly/);
    expect(new WorkspaceHistory(disk).consumeStartup()?.files[0].path).toBe("main.go");
  });
  it("consumes automatic startup before validation and retains an explicit retry", () => {
    const disk = storage(); const history = new WorkspaceHistory(disk); history.remember(document().snapshot());
    expect(history.consumeStartup()?.root).toBe("C:/project");
    const restarted = new WorkspaceHistory(disk);
    expect(restarted.consumeStartup()).toBeUndefined(); expect(restarted.sessions).toHaveLength(1);
    restarted.remember(document().snapshot()); restarted.close();
    expect(new WorkspaceHistory(disk).consumeStartup()).toBeUndefined();
    expect(restarted.sessions).toHaveLength(1);
    restarted.forget("C:/project"); expect(new WorkspaceHistory(disk).sessions).toEqual([]);
  });
  it("bounds recency and removes duplicate roots", () => {
    const history = new WorkspaceHistory(storage());
    for (let i = 0; i < 12; i++) history.remember(document(`/project/${i}`).snapshot());
    history.remember(document("/project/5").snapshot());
    expect(history.sessions).toHaveLength(10); expect(history.sessions[0].root).toBe("/project/5");
    expect(history.sessions.filter(entry => entry.root === "/project/5")).toHaveLength(1);
  });
  it("rejects malformed versions, escape paths and unbounded views", () => {
    expect(new WorkspaceHistory(storage("null")).sessions).toEqual([]);
    expect(new WorkspaceHistory(storage('{"version":2,"sessions":[]}')).sessions).toEqual([]);
    const disk = storage(JSON.stringify({ version: 1, last: "C:/project", sessions: [{ root: "C:/project", active: "../outside", files: [
      { path: "../outside" }, { path: "/outside" }, { path: "C:/outside" }, { path: "a\\b" }, { path: "main.go", view: { anchor: -4, head: 1e30, scrollTop: "bad" } }, { path: "main.go" },
    ] }] }));
    const stored = new WorkspaceHistory(disk).consumeStartup()!;
    expect(stored.files).toEqual([{ path: "main.go", view: { anchor: 0, head: 1e8, scrollTop: 0, scrollLeft: 0 } }]);
    expect(stored.active).toBeNull();
    expect(WORKSPACE_HISTORY_KEY).toContain("v1");
  });
  it("leaves editing available when storage rejects writes", () => {
    const failed = vi.fn(); const history = new WorkspaceHistory({ getItem: () => null, setItem: () => { throw Error("quota"); } }, failed);
    expect(() => history.remember(document().snapshot())).not.toThrow();
    expect(history.sessions).toHaveLength(1); expect(failed).toHaveBeenCalled();
  });
});
