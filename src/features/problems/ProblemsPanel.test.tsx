import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import ProblemsPanel from "./ProblemsPanel";
import { buildProblems, diagnosticProblems } from "./model";
it("maps real diagnostic coordinates and codes without inventing fields", () => {
  expect(diagnosticProblems("main.go", [{ severity: "warning", message: "unused", code: "UnusedVar", range: { startLine: 3, startColumn: 8, endLine: 3, endColumn: 9 } }])[0]).toMatchObject({ file: "main.go", line: 3, column: 8, source: "gopls", severity: "warning", code: "UnusedVar" });
});
it("parses compiler positions with spaces and Windows drives while rejecting outside paths and race stacks", () => {
  const output = ["C:\\workspace\\cmd space\\main.go:12:7: undefined: foo", "./main.go:2:1: syntax error", "C:\\outside\\main.go:1:1: outside", "../main.go:1:1: escape", "WARNING: DATA RACE", "main.go:5 +0x123"];
  const problems = buildProblems("C:/workspace", output.map(line => ({ runId: "run", stream: "stderr" as const, line })));
  expect(problems.map(problem => problem.file)).toEqual(["cmd space/main.go", "main.go"]); expect(problems[0].line).toBe(12);
});
it("filters and navigates current problems by keyboard and removes stale rows", () => {
  const problems = diagnosticProblems("main.go", [{ severity: "error", message: "undefined: foo", range: { startLine: 2, startColumn: 3, endLine: 2, endColumn: 6 } }, { severity: "warning", message: "unused", range: { startLine: 8, startColumn: 1, endLine: 8, endColumn: 2 } }]);
  const navigate = vi.fn(); const view = render(<ProblemsPanel problems={problems} onNavigate={navigate} />);
  expect(screen.getByRole("status")).toHaveTextContent("1 errors · 1 warnings · 2 shown");
  fireEvent.change(screen.getByLabelText("Problem severity"), { target: { value: "warning" } }); expect(screen.queryByText("undefined: foo")).toBeNull();
  fireEvent.keyDown(screen.getByRole("list"), { key: "ArrowDown" }); expect(navigate).toHaveBeenCalledWith(problems[1]);
  view.rerender(<ProblemsPanel problems={[]} onNavigate={navigate} />); expect(screen.queryByText("unused")).toBeNull(); expect(screen.getByText(/No problems/)).toBeInTheDocument();
});
