import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import GoProjectDialog from "./GoProjectDialog";
import type { GoProjectInfo } from "../../lib/ipc/types";
const { inspect, native, cancel, refresh } = vi.hoisted(() => ({ inspect: vi.fn(), native: vi.fn(), cancel: vi.fn(), refresh: vi.fn() }));
vi.mock("./useGoProjectInfo", () => ({ useGoProjectInfo: inspect }));
vi.mock("../../lib/ipc/client", () => ({ runGoModuleAction: native, cancelLanguageRequest: cancel }));
afterEach(cleanup);
const context: GoProjectInfo = { directory: "C:/root/a", mode: "workspace", workFile: "C:/root/go.work", workError: null, limited: false, environment: {} as GoProjectInfo["environment"], modules: [{ directory: "C:/root/a", relativeDirectory: "a", modFile: "C:/root/a/go.mod", modulePath: "example.test/a", goVersion: "1.21", insideWorkspace: true, error: null }] };
it("keeps module output and the dialog owned until cancellation/cleanup is acknowledged", async () => {
  inspect.mockReturnValue({ info: context, error: null, checking: false, cancel: vi.fn(), refresh });
  let finish!: (value: unknown) => void; native.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })); cancel.mockResolvedValue({ ok: true, data: true });
  const close = vi.fn(), changed = vi.fn(); const transaction = vi.fn(async (operation: () => Promise<void>) => { await operation(); return true; });
  render(<GoProjectDialog open root="C:/root" activePath="a/main.go" onClose={close} transaction={transaction} onChanged={changed} />);
  fireEvent.click(screen.getByRole("button", { name: "Save All and Tidy Module" }));
  await waitFor(() => expect(native).toHaveBeenCalledOnce());
  expect(native).toHaveBeenCalledWith(expect.objectContaining({ relativeDirectory: "a", expectedWorkFile: "C:/root/go.work" }));
  const dialog = screen.getByRole("dialog", { name: "Go Project" }); fireEvent(dialog, new Event("cancel", { cancelable: true }));
  expect(close).not.toHaveBeenCalled(); expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel module command" })); expect(cancel).toHaveBeenCalled(); expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
  await act(async () => { finish({ ok: true, data: { action: "tidy", directory: "C:/root/a", success: false, exitCode: 1, stdout: "", stderr: "actual module failure" } }); });
  expect(screen.getByText("actual module failure")).toBeInTheDocument(); expect(changed).toHaveBeenCalledWith("C:/root"); expect(refresh).toHaveBeenCalled(); expect(screen.getByRole("button", { name: "Close" })).toBeEnabled();
});
it("disables workspace download when native inspection found external members", () => {
  inspect.mockReturnValue({ info: { ...context, modules: [...context.modules, { ...context.modules[0], directory: "C:/outside", relativeDirectory: null, insideWorkspace: false, error: "external member" }] }, error: null, checking: false, cancel: vi.fn(), refresh });
  render(<GoProjectDialog open root="C:/root" activePath="a/main.go" onClose={() => {}} transaction={async operation => { await operation(); return true; }} />);
  expect(screen.getByRole("button", { name: "Save All and Download Dependencies" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Save All and Tidy Module" })).toBeEnabled();
});
