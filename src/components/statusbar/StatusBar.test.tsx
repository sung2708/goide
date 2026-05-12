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
  it("shows explicit runtime-off label before runtime is available", () => {
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

    expect(screen.getByText("Runtime Off")).toBeInTheDocument();
  });
});

describe("StatusBar diagnostics availability", () => {
  it("shows diagnostics healthy label when tooling is available", () => {
    renderStatusBar("available");

    expect(screen.getByText("Diag OK")).toBeInTheDocument();
  });

  it("shows actionable setup label when tooling is unavailable", () => {
    renderStatusBar("unavailable");

    expect(screen.getByText("Diag Setup")).toBeInTheDocument();
    expect(
      screen.getByTitle(/gopls is unavailable\. install gopls/i)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /show terminal panel/i })).toBeEnabled();
  });

  it("shows neutral diagnostics label before any diagnostics check runs", () => {
    renderStatusBar("idle");

    expect(screen.getByText("Diag --")).toBeInTheDocument();
    expect(
      screen.getByTitle(/diagnostics have not been checked/i)
    ).toBeInTheDocument();
  });
});

describe("StatusBar toolchain preflight", () => {
  it("shows healthy toolchain label when Go tooling is available", () => {
    renderStatusBar();

    expect(screen.getByText("Tools OK")).toBeInTheDocument();
    expect(screen.getByTitle(/go, gopls, and delve are available/i)).toBeInTheDocument();
  });

  it("shows setup label with missing tools in tooltip", () => {
    renderStatusBar("available", "idle", {
      go: { available: true },
      gopls: { available: false },
      delve: { available: false },
    });

    expect(screen.getByText("Tools Setup")).toBeInTheDocument();
    expect(screen.getByTitle(/missing gopls, dlv/i)).toBeInTheDocument();
  });
});

describe("StatusBar completion availability", () => {
  it("shows completion healthy label when completion requests succeed", () => {
    renderStatusBar("available", "available");

    expect(screen.getByText("Comp OK")).toBeInTheDocument();
    expect(
      screen.getByTitle(/completion requests are healthy/i)
    ).toBeInTheDocument();
  });

  it("shows low-noise retry label when completion requests fail", () => {
    renderStatusBar("available", "degraded");

    expect(screen.getByText("Comp Retry")).toBeInTheDocument();
    expect(
      screen.getByTitle(/completion backend is unavailable/i)
    ).toBeInTheDocument();
  });

  it("shows neutral completion label before any completion checks", () => {
    renderStatusBar("available", "idle");

    expect(screen.getByText("Comp --")).toBeInTheDocument();
    expect(
      screen.getByTitle(/completion has not been checked/i)
    ).toBeInTheDocument();
  });
});

describe("StatusBar TERMINAL button", () => {
  it("shows the TERMINAL button with a title referencing Logs and Shell", () => {
    renderStatusBar();

    const terminalButton = screen.getByRole("button", { name: /terminal panel/i });
    expect(terminalButton).toBeInTheDocument();
    expect(terminalButton).toHaveTextContent("TERMINAL");
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
  it("shows a neutral fallback when no active symbol is available", () => {
    renderStatusBar();

    expect(screen.getByTestId("status-bar-symbol-indicator")).toHaveTextContent(
      /no active symbol/i
    );
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
