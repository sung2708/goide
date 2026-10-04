import { expect, it, vi } from "vitest";
import { exportDocumentCopy } from "./exportCopy";
const ipc = vi.hoisted(() => ({ invoke: vi.fn(), isTauri: vi.fn(() => true) }));
vi.mock("@tauri-apps/api/core", () => ipc);
it("exports exactly the captured draft through a native picker and treats cancellation as no write", async () => {
  ipc.invoke.mockResolvedValueOnce({ ok: true, data: null });
  expect(await exportDocumentCopy("nested/main.go", "unsaved" )).toBeNull();
  expect(ipc.invoke).toHaveBeenCalledWith("export_document_copy", { filename: "main.go", content: "unsaved" });
});
it("reports native failures and never substitutes browser downloads for a disk save", async () => {
  ipc.invoke.mockResolvedValueOnce({ ok: false, error: { message: "Existing target" } });
  await expect(exportDocumentCopy("main.go", "draft")).rejects.toThrow("Existing target");
  ipc.isTauri.mockReturnValue(false);
  await expect(exportDocumentCopy("main.go", "draft")).rejects.toThrow(/desktop/);
});
