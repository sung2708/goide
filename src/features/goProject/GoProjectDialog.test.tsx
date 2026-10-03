import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import GoProjectDialog from "./GoProjectDialog";
const { hook, refresh, cancel } = vi.hoisted(() => ({ hook: vi.fn(), refresh: vi.fn(), cancel: vi.fn() }));
vi.mock("./useGoProjectInfo", () => ({ useGoProjectInfo: hook }));
afterEach(cleanup);
it("shows actual workspace modules, outside-scope errors and useful environment", () => {
  hook.mockReturnValue({ checking: false, error: null, refresh, cancel, info: { mode: "workspace", directory: "/root/a", workFile: "/root/go.work", workError: null, limited: false, modules: [{ directory: "/root/a", modFile: "/root/a/go.mod", insideWorkspace: true, modulePath: "example.test/a", goVersion: "1.21", error: null }, { directory: "/external", modFile: "/external/go.mod", insideWorkspace: false, modulePath: null, error: "External module was not inspected" }], environment: { GOOS: "windows", GOPATH: "/go" } } });
  render(<GoProjectDialog open root="/root" activePath={"a\\main.go"} onClose={() => {}} />);
  expect(hook).toHaveBeenCalledWith(true, "/root", "a");
  expect(screen.getByText("example.test/a · Go 1.21")).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("External module was not inspected");
  expect(screen.getByText("GOOS")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Refresh project" })); expect(refresh).toHaveBeenCalled();
});
it("offers cancellation and shows honest native errors", () => {
  hook.mockReturnValue({ checking: true, error: "Native Go unavailable", refresh, cancel, info: null });
  render(<GoProjectDialog open root="/root" activePath="main.go" onClose={() => {}} />);
  expect(screen.getByRole("alert")).toHaveTextContent("Native Go unavailable");
  expect(screen.getByRole("button", { name: "Refresh project" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel inspection" })); expect(cancel).toHaveBeenCalled();
});
