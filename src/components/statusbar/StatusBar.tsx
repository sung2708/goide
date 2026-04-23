import { cn } from "../../lib/utils/cn";
import type { ToolchainStatus } from "../../lib/ipc/types";

type StatusBarProps = {
  workspacePath: string | null;
  activeFilePath: string | null;
  mode: "quick-insight" | "deep-trace";
  runtimeAvailability: "available" | "unavailable" | "degraded";
  diagnosticsAvailability: "available" | "unavailable" | "idle";
  completionAvailability: "available" | "degraded" | "idle";
  toolchainStatus?: ToolchainStatus | null;
  saveStatus?: "idle" | "saving" | "saved" | "error";
  runStatus?: "idle" | "running" | "done" | "error";
  branchName?: string | null;
  onToggleBranchPicker?: () => void;
  isSummaryOpen: boolean;
  isBottomPanelOpen: boolean;
  isCommandPaletteOpen: boolean;
  onToggleSummary: () => void;
  onToggleBottomPanel: () => void;
  onToggleCommandPalette: () => void;
};

function StatusBar({
  workspacePath,
  activeFilePath,
  mode,
  runtimeAvailability,
  diagnosticsAvailability,
  completionAvailability,
  toolchainStatus = null,
  saveStatus = "idle",
  runStatus = "idle",
  branchName,
  onToggleBranchPicker,
  isSummaryOpen,
  isBottomPanelOpen,
  isCommandPaletteOpen,
  onToggleSummary,
  onToggleBottomPanel,
  onToggleCommandPalette,
}: StatusBarProps) {
  const modeLabel = mode === "deep-trace" ? "Deep Trace" : "Quick Insight";
  const runtimeLabel =
    runtimeAvailability === "available"
      ? "Runtime OK"
      : runtimeAvailability === "degraded"
        ? "Runtime Retry"
        : "Runtime Off";
  const diagnosticsLabel =
    diagnosticsAvailability === "available"
      ? "Diag OK"
      : diagnosticsAvailability === "unavailable"
        ? "Diag Setup"
        : "Diag --";
  const completionLabel =
    completionAvailability === "available"
      ? "Comp OK"
      : completionAvailability === "degraded"
        ? "Comp Retry"
        : "Comp --";
  const missingTools = toolchainStatus
    ? ([
        ["go", toolchainStatus.go],
        ["gopls", toolchainStatus.gopls],
        ["dlv", toolchainStatus.delve],
      ] as const)
        .filter(([, status]) => !status.available)
        .map(([name]) => name)
    : [];
  const toolsLabel =
    toolchainStatus === null
      ? "Tools --"
      : missingTools.length === 0
        ? "Tools OK"
        : "Tools Setup";
  const toolsTitle =
    toolchainStatus === null
      ? "Toolchain preflight has not run yet."
      : missingTools.length === 0
        ? "Go, gopls, and Delve are available."
        : `Missing ${missingTools.join(", ")}. Install missing tools to enable run, diagnostics, completions, and runtime sessions.`;

  const pillOk = "border-[rgba(166,209,137,0.3)] bg-[rgba(166,209,137,0.08)] text-[var(--green)]";
  const pillWarn = "border-[rgba(229,200,144,0.3)] bg-[rgba(229,200,144,0.08)] text-[var(--yellow)]";
  const pillIdle = "border-[var(--border-subtle)] bg-[var(--surface0)] text-[var(--overlay1)]";

  return (
    <footer className="relative z-50 flex h-9 items-center justify-between border-t border-[var(--border-muted)] bg-[var(--crust)] px-3 text-[12px] font-medium text-[var(--subtext0)]">
      <div className="flex items-center gap-4 overflow-hidden">
        <div className="flex items-center gap-2">
          <span className="flex size-[6px] rounded-full bg-[var(--green)]"></span>
          <span className="max-w-[140px] truncate font-semibold text-[var(--subtext1)] tabular-nums">
            {workspacePath ? workspacePath.split(/[\\/]/).pop() : "OFFLINE"}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[var(--overlay1)]">
          <span className="text-[var(--surface2)]">/</span>
          <span className="max-w-[200px] truncate">{activeFilePath ?? "IDLE"}</span>
        </div>
        {branchName && onToggleBranchPicker && (
          <button
            type="button"
            aria-label="Switch branch"
            className="rounded border px-2 py-0.5 font-semibold border-[var(--border-subtle)] bg-[var(--surface0)] text-[var(--subtext1)]"
            onClick={onToggleBranchPicker}
          >
            {branchName}
          </button>
        )}
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded border px-2 py-0.5 font-semibold border-[var(--border-subtle)] bg-[var(--surface0)] text-[var(--subtext0)]">
            <span
              className={`size-[5px] rounded-full ${mode === "deep-trace" ? "bg-[var(--blue)]" : "bg-[var(--overlay2)]"}`}
            ></span>
            {modeLabel}
            <span className="sr-only">Mode: {modeLabel}</span>
          </span>
          <span className={cn("rounded border px-2 py-0.5 font-semibold", runtimeAvailability === "available" ? pillOk : runtimeAvailability === "degraded" ? pillWarn : pillIdle)}>
            {runtimeLabel}
            <span className="sr-only">Runtime: {runtimeLabel}</span>
          </span>
          <span
            title={
              completionAvailability === "available"
                ? "Completion requests are healthy."
                : completionAvailability === "degraded"
                  ? "Completion backend is unavailable. Retry after a moment."
                  : "Completion has not been checked for the current context yet."
            }
            className={cn("rounded border px-2 py-0.5 font-semibold", completionAvailability === "available" ? pillOk : completionAvailability === "degraded" ? pillWarn : pillIdle)}
          >
            {completionLabel}
            <span className="sr-only">Completion: {completionLabel}</span>
          </span>
          <span
            title={
              diagnosticsAvailability === "available"
                ? "Diagnostics are available."
                : diagnosticsAvailability === "unavailable"
                  ? "gopls is unavailable. Install gopls to restore diagnostics."
                  : "Diagnostics have not been checked for the current context yet."
            }
            className={cn("rounded border px-2 py-0.5 font-semibold", diagnosticsAvailability === "available" ? pillOk : diagnosticsAvailability === "unavailable" ? pillWarn : pillIdle)}
          >
            {diagnosticsLabel}
            <span className="sr-only">Diagnostics: {diagnosticsLabel}</span>
          </span>
          <span
            title={toolsTitle}
            className={cn("rounded border px-2 py-0.5 font-semibold", toolchainStatus === null ? pillIdle : missingTools.length === 0 ? pillOk : pillWarn)}
          >
            {toolsLabel}
            <span className="sr-only">Toolchain: {toolsLabel}</span>
          </span>
        </div>

        <div className="h-3 w-px bg-[var(--surface1)]"></div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label={isCommandPaletteOpen ? "Hide command palette" : "Show command palette"}
            title="Open run commands for the active Go file."
            className={cn(
              "rounded px-2.5 py-1 font-semibold transition-colors duration-100",
              isCommandPaletteOpen
                ? "bg-[var(--bg-active)] text-[var(--lavender)]"
                : "text-[var(--subtext0)] hover:bg-[var(--bg-hover)] hover:text-[var(--subtext1)]"
            )}
            onClick={onToggleCommandPalette}
          >
            COMMANDS
          </button>
          <button
            type="button"
            aria-label={isSummaryOpen ? "Hide summary panel" : "Show summary panel"}
            title="Show or hide the current file's concurrency summary."
            className={cn(
              "rounded px-2.5 py-1 font-semibold transition-colors duration-100",
              isSummaryOpen
                ? "bg-[var(--bg-active)] text-[var(--lavender)]"
                : "text-[var(--subtext0)] hover:bg-[var(--bg-hover)] hover:text-[var(--subtext1)]"
            )}
            onClick={onToggleSummary}
          >
            SUMMARY
          </button>
          <button
            type="button"
            aria-label={isBottomPanelOpen ? "Hide terminal panel" : "Show terminal panel"}
            title="Show or hide the Logs and Shell terminal panel for the active editor session."
            className={cn(
              "rounded px-2.5 py-1 font-semibold transition-colors duration-100",
              isBottomPanelOpen
                ? "bg-[var(--bg-active)] text-[var(--lavender)]"
                : "text-[var(--subtext0)] hover:bg-[var(--bg-hover)] hover:text-[var(--subtext1)]"
            )}
            onClick={onToggleBottomPanel}
          >
            TERMINAL
          </button>
        </div>

        <div className="h-3 w-px bg-[var(--surface1)]"></div>

        <div className="flex min-w-[80px] items-center justify-end gap-3 tabular-nums">
          <span className="font-semibold text-[var(--overlay2)]">
            {saveStatus === "saving"
              ? "SYNCING..."
              : saveStatus === "saved"
                ? "READY"
                : saveStatus === "error"
                  ? "FAULT"
                  : ""}
          </span>
          <span className={cn("font-semibold", runStatus === "running" && "text-[var(--green)]")}>
            {runStatus === "running" ? "LIVE" : ""}
          </span>
        </div>
      </div>
    </footer>
  );
}

export default StatusBar;
