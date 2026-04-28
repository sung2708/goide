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
  default: ({ surfaceKey }: { surfaceKey: string | null }) => (
    <div data-testid="shell-terminal-view">shell:{surfaceKey ?? "none"}</div>
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
        surfaceKey="editor:main.go"
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
        surfaceKey="editor:main.go"
        workspacePath="C:/workspace"
      />
    );

    // Both panels stay mounted; only visibility differs
    const shellView = screen.getByTestId("shell-terminal-view");
    expect(shellView).toBeInTheDocument();
    // The shell panel's wrapper should be active when shell is selected
    expect(shellView.parentElement).toHaveAttribute("aria-hidden", "false");
    expect(shellView.parentElement).not.toHaveClass("pointer-events-none", "opacity-0");

    const logsView = screen.getByTestId("logs-terminal-view");
    expect(logsView).toBeInTheDocument();
    // The logs panel stays mounted but becomes inactive when shell is selected
    expect(logsView.parentElement).toHaveAttribute("aria-hidden", "true");
    expect(logsView.parentElement).toHaveClass("pointer-events-none", "opacity-0");
  });

  it("logs tab is selected by default when activeTab is logs", () => {
    render(
      <BottomPanel
        activeTab="logs"
        onActiveTabChange={vi.fn()}
        logEntries={[]}
        surfaceKey={null}
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
        surfaceKey={null}
        workspacePath={null}
      />
    );

    await user.click(screen.getByRole("tab", { name: /logs/i }));

    expect(onActiveTabChange).toHaveBeenCalledWith("logs");
  });

  it("clears output on demand (logs tab) via overflow menu", async () => {
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
          surfaceKey={null}
          workspacePath={null}
          onClear={() => setEntries([])}
        />
      );
    }

    render(<Harness />);

    expect(screen.getByTestId("logs-terminal-view")).toHaveTextContent("logs:1");

    // Clear is now in the overflow menu — open it first
    await user.click(screen.getByRole("button", { name: /more panel actions/i }));
    await user.click(screen.getByRole("menuitem", { name: /^clear$/i }));
    // Confirm the clear dialog
    await user.click(screen.getByRole("button", { name: /^clear$/i }));

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
        surfaceKey={null}
        workspacePath={null}
        onClear={onClear}
      />
    );

    // Open overflow menu, then click Clear menuitem to trigger dialog
    await user.click(screen.getByRole("button", { name: /more panel actions/i }));
    await user.click(screen.getByRole("menuitem", { name: /^clear$/i }));
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
        surfaceKey={null}
        workspacePath={null}
        onClear={onClear}
      />
    );

    // Open overflow menu, click Clear to open dialog
    await user.click(screen.getByRole("button", { name: /more panel actions/i }));
    await user.click(screen.getByRole("menuitem", { name: /^clear$/i }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog", { name: /clear output\?/i })).toBeNull();

    // Open overflow menu again and click Clear to open dialog again
    await user.click(screen.getByRole("button", { name: /more panel actions/i }));
    await user.click(screen.getByRole("menuitem", { name: /^clear$/i }));
    fireEvent.click(screen.getByRole("alertdialog", { name: /clear output\?/i }));

    expect(screen.queryByRole("alertdialog", { name: /clear output\?/i })).toBeNull();
    expect(onClear).not.toHaveBeenCalled();
  });

  it("invokes onRun when run-again is clicked (logs tab) — stays inline", async () => {
    const user = userEvent.setup();
    const onRun = vi.fn();

    render(
      <BottomPanel
        activeTab="logs"
        onActiveTabChange={vi.fn()}
        logEntries={[]}
        surfaceKey={null}
        workspacePath={null}
        isRunning={false}
        onRun={onRun}
      />
    );

    // Run Again is a primary action — inline, no overflow needed
    await user.click(screen.getByRole("button", { name: /run again/i }));

    expect(onRun).toHaveBeenCalledTimes(1);
  });

  it("invokes onRunWithRace when run-race is clicked via overflow menu (logs tab)", async () => {
    const user = userEvent.setup();
    const onRunWithRace = vi.fn();

    render(
      <BottomPanel
        activeTab="logs"
        onActiveTabChange={vi.fn()}
        logEntries={[]}
        surfaceKey={null}
        workspacePath={null}
        isRunning={false}
        onRunWithRace={onRunWithRace}
        canRunWithRace
      />
    );

    // Run Race moves to overflow menu
    await user.click(screen.getByRole("button", { name: /more panel actions/i }));
    await user.click(screen.getByRole("menuitem", { name: /run race/i }));

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
        surfaceKey={null}
        workspacePath={null}
        isRunning
        onStop={onStop}
      />
    );

    await user.click(screen.getByRole("button", { name: /stop/i }));

    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("keeps a minimum panel height without forcing a capped shell height in bottom dock", () => {
    render(
      <BottomPanel
        activeTab="logs"
        onActiveTabChange={vi.fn()}
        logEntries={[]}
        surfaceKey={null}
        workspacePath={null}
      />
    );

    expect(screen.getByTestId("bottom-panel")).not.toHaveClass("max-h-[40vh]");
    expect(screen.getByTestId("bottom-panel")).toHaveClass("min-h-[11rem]");
  });

  it("run/stop/clear actions are scoped to logs tab (not shown on shell tab)", () => {
    render(
      <BottomPanel
        activeTab="shell"
        onActiveTabChange={vi.fn()}
        logEntries={[]}
        surfaceKey={null}
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
    // Run Race is in overflow which is also not shown in shell tab
    expect(screen.queryByRole("button", { name: /more panel actions/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^clear$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /stop/i })).toBeNull();
  });

  it("shell tab shows shell-specific content and does not render the log clear action", () => {
    render(
      <BottomPanel
        activeTab="shell"
        onActiveTabChange={vi.fn()}
        logEntries={[{ runId: "r1", line: "some output", stream: "stdout" }]}
        surfaceKey="editor:main.go"
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
    expect(shellView.parentElement).toHaveAttribute("aria-hidden", "false");
    expect(shellView.parentElement).not.toHaveClass("pointer-events-none", "opacity-0");

    // Log clear action must not appear when shell tab is active
    expect(screen.queryByRole("button", { name: /^clear$/i })).toBeNull();
  });

  it("shows dock mode controls and changes dock mode on demand", async () => {
    const user = userEvent.setup();
    const onDockModeChange = vi.fn();

    render(
      <BottomPanel
        activeTab="shell"
        onActiveTabChange={vi.fn()}
        logEntries={[]}
        surfaceKey="editor:main.go"
        workspacePath="C:/workspace"
        dockMode="bottom"
        onDockModeChange={onDockModeChange}
      />
    );

    expect(screen.getByRole("button", { name: /dock bottom/i })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    await user.click(screen.getByRole("button", { name: /dock right/i }));

    expect(onDockModeChange).toHaveBeenCalledWith("right");
  });

  it("does not render dock mode controls without a dock mode change handler", () => {
    render(
      <BottomPanel
        activeTab="shell"
        onActiveTabChange={vi.fn()}
        logEntries={[]}
        surfaceKey="editor:main.go"
        workspacePath="C:/workspace"
      />
    );

    expect(screen.queryByRole("button", { name: /dock bottom/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /dock right/i })).toBeNull();
  });

  it("uses right-dock panel framing when docked right", () => {
    render(
      <BottomPanel
        activeTab="shell"
        onActiveTabChange={vi.fn()}
        logEntries={[]}
        surfaceKey="editor:main.go"
        workspacePath="C:/workspace"
        dockMode="right"
        onDockModeChange={vi.fn()}
      />
    );

    expect(screen.getByTestId("bottom-panel")).toHaveClass("h-full");
    expect(screen.getByTestId("bottom-panel")).toHaveClass("border-l");
  });

  it("logs tab shows Run Again inline and a More button; Clear and Hide are not inline", () => {
    render(
      <BottomPanel
        activeTab="logs"
        onActiveTabChange={vi.fn()}
        logEntries={[]}
        surfaceKey={null}
        workspacePath={null}
        isRunning={false}
        onRun={vi.fn()}
        onClear={vi.fn()}
        onClose={vi.fn()}
      />
    );

    // Primary action stays inline
    expect(screen.getByRole("button", { name: /run again/i })).toBeInTheDocument();
    // Overflow button present
    expect(screen.getByRole("button", { name: /more panel actions/i })).toBeInTheDocument();
    // Secondary actions are NOT inline
    expect(screen.queryByRole("button", { name: /^clear$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /hide/i })).toBeNull();
  });

  it("shell tab hides log-only actions including Run Again, Run Race, and the overflow button", () => {
    render(
      <BottomPanel
        activeTab="shell"
        onActiveTabChange={vi.fn()}
        logEntries={[]}
        surfaceKey={null}
        workspacePath={null}
        isRunning={false}
        onRun={vi.fn()}
        onRunWithRace={vi.fn()}
        canRunWithRace
        onClear={vi.fn()}
        onClose={vi.fn()}
        onStop={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: /run again/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /run race/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /more panel actions/i })).toBeNull();
  });

  it("logs tab still shows the overflow button for Clear and Hide Panel while a run is in progress", () => {
    render(
      <BottomPanel
        activeTab="logs"
        onActiveTabChange={vi.fn()}
        logEntries={[]}
        surfaceKey={null}
        workspacePath={null}
        isRunning
        onClear={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: /run race/i })).toBeNull();
    expect(screen.getByRole("button", { name: /more panel actions/i })).toBeInTheDocument();
  });

  it("overflow menu contains Run Race, Clear, and Hide Panel items when relevant", async () => {
    const user = userEvent.setup();

    render(
      <BottomPanel
        activeTab="logs"
        onActiveTabChange={vi.fn()}
        logEntries={[]}
        surfaceKey={null}
        workspacePath={null}
        isRunning={false}
        onRun={vi.fn()}
        onRunWithRace={vi.fn()}
        canRunWithRace
        onClear={vi.fn()}
        onClose={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /more panel actions/i }));

    const menu = screen.getByRole("menu");
    expect(menu).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /run race/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /^clear$/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /hide panel/i })).toBeInTheDocument();
  });

  it("overflow menu invokes onClose when Hide Panel is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <BottomPanel
        activeTab="logs"
        onActiveTabChange={vi.fn()}
        logEntries={[]}
        surfaceKey={null}
        workspacePath={null}
        isRunning={false}
        onClose={onClose}
      />
    );

    await user.click(screen.getByRole("button", { name: /more panel actions/i }));
    await user.click(screen.getByRole("menuitem", { name: /hide panel/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
