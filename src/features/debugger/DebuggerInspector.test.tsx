import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DebuggerInspector from "./DebuggerInspector";
import { queryDebuggerInspection } from "../../lib/ipc/client";
import type { ApiResponse, DebuggerInspectionOutput, DebuggerInspectionRequest, DebuggerState } from "../../lib/ipc/types";
vi.mock("../../lib/ipc/client", () => ({ queryDebuggerInspection: vi.fn() }));
const query = vi.mocked(queryDebuggerInspection);
const navigate = vi.fn();
const state: DebuggerState = { sessionActive: true, paused: true, stopToken: "adapter:1", selectedThreadId: 1, breakpoints: [] };

function result(request: DebuggerInspectionRequest): ApiResponse<DebuggerInspectionOutput> {
  const common = { stopToken: request.stopToken, limited: false };
  switch (request.query.kind) {
    case "threads": return { ok: true, data: { ...common, kind: "threads", selectedThreadId: 1, items: [{ id: 1, name: "[Go 1] main.main" }, { id: 2, name: "[Go 2] main.worker" }] } };
    case "stack": return { ok: true, data: { ...common, kind: "stack", totalFrames: 2, items: [{ id: 10, name: "main.main", source: "main.go", relativePath: "main.go", line: 6, column: 1 }, { id: 11, name: "main.worker", source: "worker.go", relativePath: "worker.go", line: 12, column: 2 }] } };
    case "scopes": return { ok: true, data: { ...common, kind: "scopes", items: [{ name: request.query.frameId === 10 ? "Locals" : "Worker locals", reference: request.query.frameId === 10 ? 20 : 40, expensive: false }] } };
    case "variables": return { ok: true, data: { ...common, kind: "variables", nextStart: null, items: request.query.reference === 20 ? [{ name: "box", value: "main.Box", variableType: "main.Box", reference: 21, indexedVariables: null, namedVariables: 1, truncated: false }] : [{ name: "N", value: "41", variableType: "int", reference: 0, indexedVariables: null, namedVariables: null, truncated: false }] } };
  }
}
beforeEach(() => { vi.clearAllMocks(); query.mockImplementation(async request => result(request)); });

describe("actual debugger inspection UI", () => {
  it("loads only requested nested values and changes variable context on frame selection", async () => {
    render(<DebuggerInspector root="D:/workspace" state={state} navigate={navigate} />);
    await screen.findByText("Locals");
    expect(query.mock.calls.some(([request]) => request.query.kind === "variables")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Expand values" }));
    await screen.findByText("box");
    fireEvent.click(screen.getByRole("button", { name: "Expand values" }));
    await screen.findByText("41");
    fireEvent.click(screen.getByRole("button", { name: /main.worker.*worker.go/i }));
    await screen.findByText("Worker locals");
    expect(screen.queryByText("41")).toBeNull();
    expect(navigate).toHaveBeenCalledWith(expect.objectContaining({ relativePath: "worker.go", line: 12 }));
    expect(query).toHaveBeenCalledWith(expect.objectContaining({ query: { kind: "scopes", frameId: 11 } }));
  });

  it("discards late variable values after the workspace and stop token change", async () => {
    let resolve!: (value: ApiResponse<DebuggerInspectionOutput>) => void;
    query.mockImplementation(async request => request.query.kind === "variables" ? new Promise(response => { resolve = response; }) : result(request));
    const rendered = render(<DebuggerInspector root="D:/first" state={state} navigate={navigate} />);
    await screen.findByText("Locals");
    fireEvent.click(screen.getByRole("button", { name: "Expand values" }));
    await waitFor(() => expect(resolve).toBeDefined());
    rendered.rerender(<DebuggerInspector root="E:/second" state={{ ...state, stopToken: "adapter:2" }} navigate={navigate} />);
    await screen.findByText("Locals");
    await act(async () => resolve({ ok: true, data: { kind: "variables", stopToken: "adapter:1", limited: false, nextStart: null, items: [{ name: "obsolete", value: "old workspace value", variableType: null, reference: 0, indexedVariables: null, namedVariables: null, truncated: false }] } }));
    expect(screen.queryByText("obsolete")).toBeNull();
    expect(query).toHaveBeenCalledWith(expect.objectContaining({ workspaceRoot: "E:/second", stopToken: "adapter:2", query: { kind: "threads" } }));
  });

  it("clears paused data immediately while running and surfaces unavailable values", async () => {
    query.mockImplementation(async request => request.query.kind === "variables" ? { ok: false, error: { code: "unavailable", message: "Delve cannot load optimized value" } } : result(request));
    const rendered = render(<DebuggerInspector root="D:/workspace" state={state} navigate={navigate} />);
    await screen.findByText("Locals");
    fireEvent.click(screen.getByRole("button", { name: "Expand values" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Delve cannot load optimized value");
    rendered.rerender(<DebuggerInspector root="D:/workspace" state={{ ...state, paused: false, stopToken: null }} navigate={navigate} />);
    expect(screen.queryByRole("region", { name: "Variables" })).toBeNull();
    expect(screen.queryByText("Locals")).toBeNull();
  });

  it("pages indexed children using the issued reference and actual next page", async () => {
    query.mockImplementation(async request => {
      if (request.query.kind !== "variables") return result(request);
      const common = { kind: "variables" as const, stopToken: request.stopToken, limited: false };
      if (request.query.reference === 20) return { ok: true, data: { ...common, nextStart: null, items: [{ name: "values", value: "[]int len: 300", variableType: "[]int", reference: 30, indexedVariables: 300, namedVariables: 0, truncated: false }] } };
      const start = request.query.start ?? 0;
      return { ok: true, data: { ...common, nextStart: start + 100 < 300 ? start + 100 : null, items: [{ name: `[${start}]`, value: String(start), variableType: "int", reference: 0, indexedVariables: null, namedVariables: null, truncated: false }] } };
    });
    render(<DebuggerInspector root="D:/workspace" state={state} navigate={navigate} />);
    await screen.findByText("Locals");
    fireEvent.click(screen.getByRole("button", { name: "Expand values" }));
    await screen.findByText("values");
    fireEvent.click(screen.getByRole("button", { name: "Expand values" }));
    await screen.findByText("[0]");
    fireEvent.click(screen.getByRole("button", { name: "Load next 100 indexed entries" }));
    await screen.findByText("[100]");
    expect(query).toHaveBeenCalledWith({ workspaceRoot: "D:/workspace", stopToken: "adapter:1", query: { kind: "variables", reference: 30, start: 100, indexed: true } });
  });
});
