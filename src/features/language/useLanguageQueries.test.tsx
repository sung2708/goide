import { act, renderHook, render, screen, fireEvent } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { positionAt, useLanguageQueries } from "./useLanguageQueries";
import LanguageResults from "./LanguageResults";
import { DocumentSession } from "../documents/DocumentSession";
const queryMock = vi.hoisted(() => vi.fn());
vi.mock("../../lib/ipc/client", () => ({ queryWorkspaceLanguage: queryMock }));

it("uses UTF-16 cursor positions across CRLF and Unicode", () => {
  expect(positionAt("😀x\r\nabc", 8)).toEqual({ line: 2, column: 4 });
  expect(positionAt("😀x", 2)).toEqual({ line: 1, column: 3 });
  expect(positionAt("a", -1)).toBeNull();
  expect(positionAt("a", 2)).toBeNull();
});

it("sends every unsaved Go buffer and rejects results after editing or closing", async () => {
  const session = new DocumentSession(); session.reset("C:/workspace");
  const main = session.open("main.go", "package main\n");
  session.open("helper.go", "package main\nconst Unsaved = 1\n");
  session.activate(main.id);
  let resolve!: (value: unknown) => void;
  queryMock.mockImplementation(() => new Promise(complete => { resolve = complete; }));
  const hook = renderHook(({ snapshot }) => useLanguageQueries(snapshot, 8), { initialProps: { snapshot: session.snapshot() } });
  let pending!: Promise<void>;
  act(() => { pending = hook.result.current.query("definition"); });
  expect(queryMock).toHaveBeenLastCalledWith(expect.objectContaining({ line: 1, column: 9, buffers: [{ path: "main.go", content: "package main\n" }, { path: "helper.go", content: "package main\nconst Unsaved = 1\n" }] }));
  session.edit(main.id, "package changed\n");
  hook.rerender({ snapshot: session.snapshot() });
  await act(async () => { resolve({ ok: true, data: { locations: [], text: "obsolete", outsideWorkspace: 0 } }); await pending; });
  expect(hook.result.current.state).toBeNull();
  act(() => { pending = hook.result.current.query("hover"); });
  act(() => hook.result.current.close());
  await act(async () => { resolve({ ok: false, error: { code: "failed", message: "obsolete error" } }); await pending; });
  expect(hook.result.current.state).toBeNull();
});

it("surfaces real tooling failures and navigates located results without rendering HTML", () => {
  const location = { path: "helper.go", line: 2, column: 7, endLine: 2, endColumn: 14 };
  const navigate = vi.fn(); const close = vi.fn();
  const view = render(<LanguageResults state={{ kind: "references", loading: false, error: null, result: { locations: [location], text: "<script>fake()</script>", outsideWorkspace: 1 } }} onClose={close} onNavigate={navigate} />);
  fireEvent.click(screen.getByRole("button", { name: "helper.go:2:7" })); expect(navigate).toHaveBeenCalledWith(location);
  expect(screen.getByText("<script>fake()</script>").tagName).toBe("PRE");
  expect(screen.getByRole("status")).toHaveTextContent("outside the workspace");
  view.rerender(<LanguageResults state={{ kind: "hover", loading: false, result: null, error: "gopls unavailable" }} onClose={close} onNavigate={navigate} />);
  expect(screen.getByRole("alert")).toHaveTextContent("gopls unavailable");
});
