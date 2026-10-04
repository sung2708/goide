import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import NewGoProjectDialog from "./NewGoProjectDialog";
const { create, choose, configure } = vi.hoisted(() => ({ create: vi.fn(), choose: vi.fn(), configure: vi.fn() }));
vi.mock("../../lib/ipc/client", () => ({ createGoProject: create }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: choose }));
vi.mock("../settings/toolchainConfiguration", () => ({ configureInOrder: configure }));
beforeEach(() => { vi.clearAllMocks(); choose.mockResolvedValue("C:/projects"); configure.mockResolvedValue({ ok: true }); });
async function fill() {
  fireEvent.click(screen.getByRole("button", { name: "Browse…" }));
  await waitFor(() => expect(screen.getByLabelText("Parent folder")).toHaveValue("C:/projects"));
  fireEvent.change(screen.getByLabelText("Project name"), { target: { value: "hello" } });
  fireEvent.change(screen.getByLabelText("Module path"), { target: { value: "example.test/hello" } });
}
it("creates once and preserves the new folder when opening is cancelled", async () => {
  create.mockResolvedValue({ ok: true, data: "C:/projects/hello" });
  const open = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true), close = vi.fn();
  render(<NewGoProjectDialog paths={{ go: "", gopls: "", dlv: "" }} onClose={close} onCreated={open} />);
  expect(screen.getByRole("button", { name: "Create Project" })).toBeDisabled();
  await fill(); fireEvent.click(screen.getByRole("button", { name: "Create Project" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Opening was cancelled or blocked");
  expect(create).toHaveBeenCalledWith({ parentDirectory: "C:/projects", name: "hello", modulePath: "example.test/hello" });
  fireEvent.click(screen.getByRole("button", { name: "Open Project" }));
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(create).toHaveBeenCalledOnce();
});
it("keeps the dialog owned while creating and displays native errors", async () => {
  let finish!: (value: unknown) => void;
  create.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const close = vi.fn(), open = vi.fn();
  render(<NewGoProjectDialog paths={{ go: "", gopls: "", dlv: "" }} onClose={close} onCreated={open} />);
  await fill(); fireEvent.click(screen.getByRole("button", { name: "Create Project" }));
  await waitFor(() => expect(create).toHaveBeenCalledOnce());
  expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
  fireEvent.keyDown(document, { key: "Escape" }); expect(close).not.toHaveBeenCalled();
  await act(async () => finish({ ok: false, error: { message: "Project folder already exists" } }));
  expect(screen.getByRole("alert")).toHaveTextContent("already exists"); expect(open).not.toHaveBeenCalled();
});
