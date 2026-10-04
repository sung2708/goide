import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSafeWindowClose } from "./useSafeWindowClose";
const mocks = vi.hoisted(() => ({ close: null as null | ((event: { preventDefault: () => void }) => void), stop: vi.fn(), destroy: vi.fn(), invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: async () => () => undefined }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ destroy: mocks.destroy, onCloseRequested: async (callback: typeof mocks.close) => { mocks.close = callback; return mocks.stop; } }) }));
const save = vi.fn(), discard = vi.fn(), error = vi.fn(), cancelAutosave = vi.fn();
let installRequest: (() => void) | undefined;
const install = vi.fn();
function Host({ busy = false, updates = false }: { busy?: boolean; updates?: boolean }) { return useSafeWindowClose({ dirty: () => true, busy: () => busy, save, discard, onError: error, cancelAutosave, ...(updates ? { registerInstall: (handler: () => void) => { installRequest = handler; return () => { installRequest = undefined; }; }, install } : {}) }); }
async function requestClose() {
  await waitFor(() => expect(mocks.close).not.toBeNull());
  const preventDefault = vi.fn();
  act(() => { mocks.close?.({ preventDefault }); });
  expect(preventDefault).toHaveBeenCalled(); expect(cancelAutosave).toHaveBeenCalled();
}
describe("native safe close", () => {
  beforeEach(() => {
    vi.stubGlobal("__TAURI_INTERNALS__", {}); mocks.close = null;
    mocks.invoke.mockReset().mockResolvedValue({ ok: true }); mocks.destroy.mockReset().mockResolvedValue(undefined);
    save.mockReset().mockResolvedValue(true); discard.mockReset(); error.mockReset(); cancelAutosave.mockReset(); mocks.stop.mockReset();
    install.mockReset().mockResolvedValue(undefined); installRequest = undefined;
  });
  afterEach(() => vi.unstubAllGlobals());
  it("discards only after cleanup succeeds, retains the choice through retry, and never saves", async () => {
    mocks.invoke.mockResolvedValueOnce({ ok: false, error: { message: "cleanup failed" } });
    render(<Host />); await requestClose();
    fireEvent.click(screen.getByRole("button", { name: "Don't Save and close" }));
    await screen.findByText("cleanup failed");
    expect(discard).not.toHaveBeenCalled(); expect(mocks.destroy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Retry cleanup and close" }));
    await waitFor(() => expect(mocks.destroy).toHaveBeenCalledTimes(1));
    expect(save).not.toHaveBeenCalled(); expect(discard).toHaveBeenCalledTimes(1);
    expect(mocks.invoke.mock.invocationCallOrder[1]).toBeLessThan(discard.mock.invocationCallOrder[0]);
    expect(discard.mock.invocationCallOrder[0]).toBeLessThan(mocks.destroy.mock.invocationCallOrder[0]);
  });
  it("keeps the window open when discard persistence fails and retries it", async () => {
    discard.mockImplementationOnce(() => { throw new Error("draft cleanup denied"); });
    render(<Host />); await requestClose();
    fireEvent.click(screen.getByRole("button", { name: "Don't Save and close" }));
    await screen.findByText("draft cleanup denied"); expect(mocks.destroy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Retry cleanup and close" }));
    await waitFor(() => expect(mocks.destroy).toHaveBeenCalledTimes(1));
    expect(save).not.toHaveBeenCalled(); expect(discard).toHaveBeenCalledTimes(2);
  });
  it("cancels without saving, stopping processes or destroying the window", async () => {
    const view = render(<Host />); await requestClose();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); expect(mocks.invoke).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
    expect(discard).not.toHaveBeenCalled();
    view.unmount(); expect(mocks.stop).toHaveBeenCalled();
  });
  it("saves and closes without discarding recovery or resetting startup", async () => {
    render(<Host />); await requestClose();
    fireEvent.click(screen.getByRole("button", { name: "Save and close" }));
    await waitFor(() => expect(mocks.destroy).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledTimes(1); expect(discard).not.toHaveBeenCalled();
  });
  it("keeps failed saves open and stops owned resources before discarding and closing", async () => {
    save.mockResolvedValue(false); render(<Host />); await requestClose();
    fireEvent.click(screen.getByRole("button", { name: "Save and close" }));
    await waitFor(() => expect(save).toHaveBeenCalled()); expect(mocks.destroy).not.toHaveBeenCalled(); expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Don't Save and close" }));
    await waitFor(() => expect(mocks.destroy).toHaveBeenCalledTimes(1));
    expect(mocks.invoke).toHaveBeenCalledWith("shutdown_owned_resources");
    expect(mocks.invoke.mock.invocationCallOrder[0]).toBeLessThan(mocks.destroy.mock.invocationCallOrder[0]);
  });
  it("does not close during mutations or after cleanup failures", async () => {
    const view = render(<Host busy />); await requestClose();
    fireEvent.click(screen.getByRole("button", { name: "Save and close" }));
    expect(save).not.toHaveBeenCalled(); expect(mocks.destroy).not.toHaveBeenCalled();
    view.rerender(<Host />); mocks.invoke.mockResolvedValue({ ok: false, error: { message: "cleanup failed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save and close" }));
    await waitFor(() => expect(error).toHaveBeenCalledWith("cleanup failed")); expect(mocks.destroy).not.toHaveBeenCalled();
  });
  it("preserves drafts and acknowledges owned cleanup before invoking the installer", async () => {
    render(<Host updates />); await waitFor(() => expect(installRequest).toBeDefined());
    act(() => installRequest?.());
    expect(install).not.toHaveBeenCalled();
    save.mockResolvedValueOnce(false);
    fireEvent.click(screen.getByRole("button", { name: "Save and install" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1)); expect(mocks.invoke).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save and install" }));
    await waitFor(() => expect(install).toHaveBeenCalledTimes(1));
    expect(save.mock.invocationCallOrder[1]).toBeLessThan(mocks.invoke.mock.invocationCallOrder[0]);
    expect(mocks.invoke.mock.invocationCallOrder[0]).toBeLessThan(install.mock.invocationCallOrder[0]);
    expect(mocks.destroy).not.toHaveBeenCalled();
  });
  it("blocks installer after failed cleanup and keeps failed installation in recovery", async () => {
    render(<Host updates />); await waitFor(() => expect(installRequest).toBeDefined()); act(() => installRequest?.());
    mocks.invoke.mockResolvedValueOnce({ ok: false, error: { message: "cleanup failed" } });
    fireEvent.click(screen.getByRole("button", { name: "Discard editor edits and install" }));
    await waitFor(() => expect(error).toHaveBeenCalledWith("cleanup failed")); expect(install).not.toHaveBeenCalled();
    install.mockRejectedValueOnce(new Error("installation failed"));
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Retry cleanup and install" }));
    await waitFor(() => expect(error).toHaveBeenCalledWith("installation failed"));
    expect(screen.getByRole("alert")).toHaveTextContent("installation failed");
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Close Goro" })); await waitFor(() => expect(mocks.destroy).toHaveBeenCalledTimes(1));
    expect(install).toHaveBeenCalledTimes(1);
  });
});
