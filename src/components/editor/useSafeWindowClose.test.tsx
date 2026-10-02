import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSafeWindowClose } from "./useSafeWindowClose";
const mocks = vi.hoisted(() => ({ close: null as null | ((event: { preventDefault: () => void }) => void), stop: vi.fn(), destroy: vi.fn(), invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: async () => () => undefined }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ destroy: mocks.destroy, onCloseRequested: async (callback: typeof mocks.close) => { mocks.close = callback; return mocks.stop; } }) }));
const save = vi.fn(), error = vi.fn(), cancelAutosave = vi.fn();
function Host({ busy = false }: { busy?: boolean }) { return useSafeWindowClose({ dirty: () => true, busy: () => busy, save, onError: error, cancelAutosave }); }
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
    save.mockReset().mockResolvedValue(true); error.mockReset(); cancelAutosave.mockReset(); mocks.stop.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());
  it("cancels without saving, stopping processes or destroying the window", async () => {
    const view = render(<Host />); await requestClose();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); expect(mocks.invoke).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
    view.unmount(); expect(mocks.stop).toHaveBeenCalled();
  });
  it("keeps failed saves open and stops owned resources before discarding and closing", async () => {
    save.mockResolvedValue(false); render(<Host />); await requestClose();
    fireEvent.click(screen.getByRole("button", { name: "Save and close" }));
    await waitFor(() => expect(save).toHaveBeenCalled()); expect(mocks.destroy).not.toHaveBeenCalled(); expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Discard editor edits and close" }));
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
});
