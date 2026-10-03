import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import GoTestsDialog from "./GoTestsDialog";
import type { useGoTests } from "./useGoTests";
afterEach(cleanup);
it("renders actual test results and routes a scoped failure location", () => {
  const navigate = vi.fn(), close = vi.fn(), run = vi.fn();
  const runner: ReturnType<typeof useGoTests> = { busy: false, status: "failed", error: null, needsCleanup: false, retryCleanup: vi.fn(), run, cancel: vi.fn(), output: { packages: [{ importPath: "example.test/a", relativeDirectory: "a" }], success: false, exitCode: 1, stderr: "", stdout: JSON.stringify({ Package: "example.test/a", Test: "TestFail", Action: "fail", Elapsed: 0.03, Output: "a_test.go:4: actual failure\n" }) } };
  const view = render(<GoTestsDialog open close={close} runner={runner} directory="a" navigate={navigate} />);
  expect(screen.getByText(/example.test\/a \/ TestFail/)).toHaveTextContent("failed · 0.03s");
  fireEvent.click(screen.getByRole("button", { name: "Test Current Package" })); expect(run).toHaveBeenCalledWith("package", "a");
  fireEvent.click(screen.getByRole("button", { name: "a/a_test.go:4:1" })); expect(navigate).toHaveBeenCalledWith("a/a_test.go", 4, 1); expect(close).toHaveBeenCalled(); close.mockClear();
  view.rerender(<GoTestsDialog open close={close} runner={{ ...runner, busy: true }} directory="a" navigate={navigate} />);
  expect(screen.getByRole("button", { name: "Close" })).toBeDisabled(); fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" }); expect(close).not.toHaveBeenCalled();
});
