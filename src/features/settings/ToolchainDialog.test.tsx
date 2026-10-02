import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import ToolchainDialog from "./ToolchainDialog";
afterEach(cleanup);
it("shows concrete tool information, honest missing/failed states and refresh", () => {
  const refresh = vi.fn().mockResolvedValue(undefined), close = vi.fn();
  render(<ToolchainDialog open onClose={close} refresh={refresh} error={null} checking={false} status={{ go: { available: true, path: "C:/Go/bin/go.exe", version: "go version actual", status: "ready" }, gopls: { available: false, status: "missing", error: "not installed" }, delve: { available: false, status: "failed", error: "access denied" } }} />);
  expect(screen.getByRole("dialog", { name: "Go Toolchain" })).toHaveTextContent("C:/Go/bin/go.exe");
  expect(screen.getByText("not installed")).toBeInTheDocument(); expect(screen.getByText("access denied")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Refresh toolchain" })); expect(refresh).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Close" })); expect(close).toHaveBeenCalledOnce();
});
it("shows native detection failure and pending state rather than claiming readiness", () => {
  render(<ToolchainDialog open onClose={() => {}} refresh={async () => {}} status={null} error="Desktop required" checking />);
  expect(screen.getByRole("alert")).toHaveTextContent("Desktop required"); expect(screen.getByRole("button", { name: "Refresh toolchain" })).toBeDisabled(); expect(screen.getByRole("status")).toHaveTextContent("Checking");
});
