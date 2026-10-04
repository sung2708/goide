import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import ManagedToolchainPanel from "./ManagedToolchainPanel";
const { state, start, cancel, use, remove, updateToolPaths } = vi.hoisted(() => ({ state: vi.fn(), start: vi.fn(), cancel: vi.fn(), use: vi.fn(), remove: vi.fn(), updateToolPaths: vi.fn() }));
vi.mock("./managedTools", () => ({ managedTools: { state, start, cancel, use, remove } }));
vi.mock("./useSettings", () => ({ useSettings: () => ({ store: { updateToolPaths }, values: {}, error: null }) }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const catalog = { goVersion: "1.26.8", goplsVersion: "0.23.0", delveVersion: "1.27.2", platform: "windows-amd64", archiveBytes: 74957586 };
const paths = { go: "C:/goro/go/bin/go.exe", gopls: "C:/goro/bin/gopls.exe", dlv: "C:/goro/bin/dlv.exe" };
const snapshot = { catalog, catalogError: null, installed: [{ id: "bundle-1", catalog, paths }], progress: { requestId: null, phase: "idle", downloadedBytes: 0, error: null } };
it("installation is explicit and does not activate or persist tool paths", async () => {
  state.mockResolvedValue(snapshot); start.mockResolvedValue("operation-1");
  render(<ManagedToolchainPanel />);
  fireEvent.click(await screen.findByRole("button", { name: "Download and install tools" }));
  await waitFor(() => expect(start).toHaveBeenCalledOnce());
  expect(use).not.toHaveBeenCalled(); expect(updateToolPaths).not.toHaveBeenCalled();
  expect(screen.getByText(/additional downloads/i)).toBeInTheDocument();
});
it("persists all paths only after guarded native activation succeeds", async () => {
  state.mockResolvedValue(snapshot); use.mockResolvedValue(paths);
  render(<ManagedToolchainPanel />);
  fireEvent.click(await screen.findByRole("button", { name: "Use this bundle" }));
  await waitFor(() => expect(updateToolPaths).toHaveBeenCalledWith(paths));

});
it("keeps existing preferences when activation is rejected", async () => {
  state.mockResolvedValue(snapshot); use.mockRejectedValue(new Error("Stop active debugger"));
  render(<ManagedToolchainPanel />);
  fireEvent.click(await screen.findByRole("button", { name: "Use this bundle" }));
  expect(await screen.findByText("Stop active debugger")).toBeInTheDocument(); expect(updateToolPaths).not.toHaveBeenCalled();
});
it("keeps controls locked while cleanup is pending", async () => {
  state.mockResolvedValue({ ...snapshot, progress: { requestId: "operation-2", phase: "cancelling", downloadedBytes: 1024, error: null } }); cancel.mockResolvedValue(null);
  render(<ManagedToolchainPanel />);
  expect(await screen.findByRole("button", { name: "Download and install tools" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Use this bundle" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Cancel setup" })).toBeDisabled();
});

it("sends cancellation only for the displayed operation", async () => {
  state.mockResolvedValue({ ...snapshot, progress: { requestId: "operation-2", phase: "downloading", downloadedBytes: 1024, error: null } }); cancel.mockResolvedValue(null);
  render(<ManagedToolchainPanel />);
  fireEvent.click(await screen.findByRole("button", { name: "Cancel setup" }));
  await waitFor(() => expect(cancel).toHaveBeenCalledWith("operation-2"));
});
