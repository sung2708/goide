import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import BottomPanel from "./BottomPanel";

vi.mock("./LogsTerminalView", () => ({
  default: ({ entries }: { entries: Array<{ line: string }> }) => (
    <div data-testid="logs-terminal-view">logs:{entries.length}</div>
  ),
}));

vi.mock("./ShellTerminalView", () => ({
  default: ({ editorSessionKey }: { editorSessionKey: string | null }) => (
    <div data-testid="shell-terminal-view">shell:{editorSessionKey ?? "none"}</div>
  ),
}));

describe("BottomPanel", () => {
  it("renders the logs tab by default and switches to shell", async () => {
    const user = userEvent.setup();
    const onActiveTabChange = vi.fn();

    render(
      <BottomPanel
        activeTab="logs"
        onActiveTabChange={onActiveTabChange}
        logEntries={[{ runId: "run-1", line: "hello", stream: "stdout" }]}
        shellSessionKey="editor:main.go"
        workspacePath="C:/workspace"
      />
    );

    expect(screen.getByTestId("logs-terminal-view")).toHaveTextContent("logs:1");

    await user.click(screen.getByRole("tab", { name: /shell/i }));

    expect(onActiveTabChange).toHaveBeenCalledWith("shell");
  });

  it("renders the shell tab content when activeTab is shell", () => {
    render(
      <BottomPanel
        activeTab="shell"
        onActiveTabChange={vi.fn()}
        logEntries={[]}
        shellSessionKey="editor:main.go"
        workspacePath="C:/workspace"
      />
    );

    // Both panels stay mounted; only visibility differs
    const shellView = screen.getByTestId("shell-terminal-view");
    expect(shellView).toBeInTheDocument();
    // The shell panel's wrapper should NOT be hidden when shell is active
    expect(shellView.closest("[hidden]")).toBeNull();

    const logsView = screen.getByTestId("logs-terminal-view");
    expect(logsView).toBeInTheDocument();
    // The logs panel's wrapper should be hidden when shell is active
    expect(logsView.closest("[hidden]")).not.toBeNull();
  });

  it("logs tab is selected by default when activeTab is logs", () => {
    render(
      <BottomPanel
        activeTab="logs"
        onActiveTabChange={vi.fn()}
        logEntries={[]}
        shellSessionKey={null}
        workspacePath={null}
      />
    );

    const logsTab = screen.getByRole("tab", { name: /logs/i });
    expect(logsTab).toHaveAttribute("aria-selected", "true");
  });

  it("calls onActiveTabChange with logs when logs tab is clicked", async () => {
    const user = userEvent.setup();
    const onActiveTabChange = vi.fn();

    render(
      <BottomPanel
        activeTab="shell"
        onActiveTabChange={onActiveTabChange}
        logEntries={[]}
        shellSessionKey={null}
        workspacePath={null}
      />
    );

    await user.click(screen.getByRole("tab", { name: /logs/i }));

    expect(onActiveTabChange).toHaveBeenCalledWith("logs");
  });

  it("clears output on demand (logs tab)", async () => {
    const user = userEvent.setup();

    function Harness() {
      const [entries, setEntries] = useState([
        { runId: "r1", line: "line 1", stream: "stdout" as const },
      ]);
      return (
        <BottomPanel
          activeTab="logs"
          onActiveTabChange={vi.fn()}
          logEntries={entries}
          shellSessionKey={null}
          workspacePath={null}
          onClear={() => setEntries([])}
        />
      );
    }

    render(<Harness />);

    expect(screen.getByTestId("logs-terminal-view")).toHaveTextContent("logs:1");

    await user.click(screen.getByRole("button", { name: /^clear$/i }));
    await user.click(screen.getAllByRole("button", { name: /^clear$/i })[1]);

    expect(screen.getByTestId("logs-terminal-view")).toHaveTextContent("logs:0");
  });

  it("closes the clear confirmation without clearing output", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();

    render(
      <BottomPanel
        activeTab="logs"
        onActiveTabChange={vi.fn()}
        logEntries={[{ runId: "r1", line: "line 1", stream: "stdout" }]}
        shellSessionKey={null}
        workspacePath={null}
        onClear={onClear}
      />
    );

    await user.click(screen.getByRole("button", { name: /^clear$/i }));
    expect(screen.getByRole("alertdialog", { name: /clear output\?/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.queryByRole("alertdialog", { name: /clear output\?/i })).toBeNull();
    expect(onClear).not.toHaveBeenCalled();
  });

  it("closes the clear confirmation with Escape and backdrop click", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();

    render(
      <BottomPanel
        activeTab="logs"
        onActiveTabChange={vi.fn()}
        logEntries={[{ runId: "r1", line: "line 1", stream: "stdout" }]}
        shellSessionKey={null}
        workspacePath={null}
        onClear={onClear}
      />
    );

    await user.click(screen.getByRole("button", { name: /^clear$/i }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog", { name: /clear output\?/i })).toBeNull();

    await user.click(screen.getByRole("button", { name: /^clear$/i }));
    fireEvent.click(screen.getByRole("alertdialog", { name: /clear output\?/i }));

    expect(screen.queryByRole("alertdialog", { name: /clear output\?/i })).toBeNull();
    expect(onClear).not.toHaveBeenCalled();
  });

  it("invokes onRun when run-again is clicked (logs tab)", async () => {
    const user = userEvent.setup();
    const onRun = vi.fn();

    render(
      <BottomPanel
        activeTab="logs"
        onActiveTabChange={vi.fn()}
        logEntries={[]}
        shellSessionKey={null}
        workspacePath={null}
        isRunning={false}
        onRun={onRun}
      />
    );

    await user.click(screen.getByRole("button", { name: /run again/i }));

    expect(onRun).toHaveBeenCalledTimes(1);
  });

  it("invokes onRunWithRace when run-race is clicked (logs tab)", async () => {
    const user = userEvent.setup();
    const onRunWithRace = vi.fn();

    render(
      <BottomPanel
        activeTab="logs"
        onActiveTabChange={vi.fn()}
        logEntries={[]}
        shellSessionKey={null}
        workspacePath={null}
        isRunning={false}
        onRunWithRace={onRunWithRace}
        canRunWithRace
      />
    );

    await user.click(screen.getByRole("button", { name: /run race/i }));

    expect(onRunWithRace).toHaveBeenCalledTimes(1);
  });

  it("invokes onStop when stop is clicked during a running process (logs tab)", async () => {
    const user = userEvent.setup();
    const onStop = vi.fn();

    render(
      <BottomPanel
        activeTab="logs"
        onActiveTabChange={vi.fn()}
        logEntries={[]}
        shellSessionKey={null}
        workspacePath={null}
        isRunning
        onStop={onStop}
      />
    );

    await user.click(screen.getByRole("button", { name: /stop/i }));

    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("keeps the panel height bounded for long output", () => {
    render(
      <BottomPanel
        activeTab="logs"
        onActiveTabChange={vi.fn()}
        logEntries={[]}
        shellSessionKey={null}
        workspacePath={null}
      />
    );

    expect(screen.getByTestId("bottom-panel")).toHaveClass("max-h-[40vh]");
    expect(screen.getByTestId("bottom-panel")).toHaveClass("min-h-[11rem]");
  });

  it("run/stop/clear actions are scoped to logs tab (not shown on shell tab)", () => {
    render(
      <BottomPanel
        activeTab="shell"
        onActiveTabChange={vi.fn()}
        logEntries={[]}
        shellSessionKey={null}
        workspacePath={null}
        isRunning={false}
        onRun={vi.fn()}
        onRunWithRace={vi.fn()}
        canRunWithRace
        onClear={vi.fn()}
        onStop={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: /run again/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /run race/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^clear$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /stop/i })).toBeNull();
  });

  it("shell tab shows shell-specific content and does not render the log clear action", () => {
    render(
      <BottomPanel
        activeTab="shell"
        onActiveTabChange={vi.fn()}
        logEntries={[{ runId: "r1", line: "some output", stream: "stdout" }]}
        shellSessionKey="editor:main.go"
        workspacePath="C:/workspace"
        isRunning={false}
        onRun={vi.fn()}
        onClear={vi.fn()}
        onStop={vi.fn()}
      />
    );

    // Shell panel content is visible
    const shellView = screen.getByTestId("shell-terminal-view");
    expect(shellView).toBeInTheDocument();
    expect(shellView).toHaveTextContent("shell:editor:main.go");
    expect(shellView.closest("[hidden]")).toBeNull();

    // Log clear action must not appear when shell tab is active
    expect(screen.queryByRole("button", { name: /^clear$/i })).toBeNull();
  });
});
