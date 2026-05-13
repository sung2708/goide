import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import StatusBar from "./StatusBar";

function renderStatusBar(
  diagnosticsAvailability: "available" | "unavailable" | "idle" = "available",
  completionAvailability: "available" | "degraded" | "idle" = "idle",
  toolchainStatus = {
    go: { available: true },
    gopls: { available: true },
    delve: { available: true },
  },
  activeSymbol: { kind: string; name: string; line: number } | null = null,
  onJumpToActiveSymbol: (() => void) | undefined = undefined
) {
  return render(
    <StatusBar
      workspacePath="C:/workspace"
      activeFilePath="main.go"
      mode="quick-insight"
      runtimeAvailability="available"
      diagnosticsAvailability={diagnosticsAvailability}
      completionAvailability={completionAvailability}
      toolchainStatus={toolchainStatus}
      saveStatus="idle"
      runStatus="idle"
      activeSymbol={activeSymbol}
      onJumpToActiveSymbol={onJumpToActiveSymbol}
      isBottomPanelOpen={false}
      onToggleBottomPanel={vi.fn()}
    />
  );
}

describe("StatusBar runtime availability", () => {
  it("surfaces runtime-off in the compact health tooltip", () => {
    render(
      <StatusBar
        workspacePath="C:/workspace"
        activeFilePath="main.go"
        mode="quick-insight"
        runtimeAvailability="unavailable"
        diagnosticsAvailability="idle"
        completionAvailability="idle"
        toolchainStatus={null}
        saveStatus="idle"
        runStatus="idle"
        isBottomPanelOpen={false}
        onToggleBottomPanel={vi.fn()}
      />
    );

    expect(screen.getByTitle(/runtime: runtime off/i)).toBeInTheDocument();
  });
});

describe("StatusBar diagnostics availability", () => {
  it("surfaces diagnostics healthy state in compact health tooltip", () => {
    renderStatusBar("available");
    expect(screen.getByTitle(/diagnostics: diag ok/i)).toBeInTheDocument();
  });

  it("surfaces actionable diagnostics setup state in compact health tooltip", () => {
    renderStatusBar("unavailable");

    expect(screen.getByTitle(/diagnostics: diag setup/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /show terminal panel/i })).toBeEnabled();
  });

  it("surfaces neutral diagnostics state in compact health tooltip", () => {
    renderStatusBar("idle");

    expect(screen.getByTitle(/diagnostics: diag --/i)).toBeInTheDocument();
  });
});

describe("StatusBar toolchain preflight", () => {
  it("surfaces healthy toolchain state in compact health tooltip", () => {
    renderStatusBar();

    expect(screen.getByTitle(/toolchain: tools ok/i)).toBeInTheDocument();
  });

  it("surfaces setup label with missing tools in compact health tooltip", () => {
    renderStatusBar("available", "idle", {
      go: { available: true },
      gopls: { available: false },
      delve: { available: false },
    });

    expect(screen.getByTitle(/toolchain: tools setup/i)).toBeInTheDocument();
  });
});

describe("StatusBar completion availability", () => {
  it("surfaces completion healthy state in compact health tooltip", () => {
    renderStatusBar("available", "available");

    expect(screen.getByTitle(/completion: comp ok/i)).toBeInTheDocument();
  });

  it("surfaces completion retry state in compact health tooltip", () => {
    renderStatusBar("available", "degraded");

    expect(screen.getByTitle(/completion: comp retry/i)).toBeInTheDocument();
  });

  it("surfaces completion idle state in compact health tooltip", () => {
    renderStatusBar("available", "idle");

    expect(screen.getByTitle(/completion: comp --/i)).toBeInTheDocument();
  });
});

describe("StatusBar TERMINAL button", () => {
  it("shows the compact TERM button with a title referencing Logs and Shell", () => {
    renderStatusBar();

    const terminalButton = screen.getByRole("button", { name: /terminal panel/i });
    expect(terminalButton).toBeInTheDocument();
    expect(terminalButton).toHaveTextContent("TERM");
    expect(terminalButton).toHaveAttribute(
      "title",
      "Show or hide the Logs and Shell terminal panel for the active editor session."
    );
  });
});

describe("StatusBar branch trigger", () => {
  it("renders current branch as a clickable switch trigger", () => {
    const onToggleBranchPicker = vi.fn();
    render(
      <StatusBar
        workspacePath="C:/workspace"
        activeFilePath="main.go"
        mode="quick-insight"
        runtimeAvailability="available"
        diagnosticsAvailability="available"
        completionAvailability="available"
        toolchainStatus={null}
        branchName="develop"
        onToggleBranchPicker={onToggleBranchPicker}
        isBottomPanelOpen={false}
        onToggleBottomPanel={() => {}}
      />
    );

    expect(screen.getByRole("button", { name: /switch branch/i })).toHaveTextContent("develop");
  });

  it("calls onToggleBranchPicker when the branch button is clicked", async () => {
    const user = userEvent.setup();
    const onToggleBranchPicker = vi.fn();

    render(
      <StatusBar
        workspacePath="C:/workspace"
        activeFilePath="main.go"
        mode="quick-insight"
        runtimeAvailability="available"
        diagnosticsAvailability="available"
        completionAvailability="available"
        toolchainStatus={null}
        branchName="develop"
        onToggleBranchPicker={onToggleBranchPicker}
        isBottomPanelOpen={false}
        onToggleBottomPanel={() => {}}
      />
    );

    await user.click(screen.getByRole("button", { name: /switch branch/i }));

    expect(onToggleBranchPicker).toHaveBeenCalledTimes(1);
  });
});

describe("StatusBar active symbol indicator", () => {
  it("does not render symbol indicator when no active symbol is available", () => {
    renderStatusBar();

    expect(screen.queryByTestId("status-bar-symbol-indicator")).toBeNull();
  });

  it("renders the active symbol and jumps when clicked", async () => {
    const user = userEvent.setup();
    const onJumpToActiveSymbol = vi.fn();

    renderStatusBar(
      "available",
      "available",
      {
        go: { available: true },
        gopls: { available: true },
        delve: { available: true },
      },
      { kind: "function", name: "main", line: 2 },
      onJumpToActiveSymbol
    );

    const indicator = screen.getByRole("button", { name: /jump to active symbol/i });
    expect(indicator).toHaveTextContent(/function/i);
    expect(indicator).toHaveTextContent(/main/i);
    expect(indicator).toHaveTextContent(/l2/i);

    await user.click(indicator);

    expect(onJumpToActiveSymbol).toHaveBeenCalledTimes(1);
  });
});
