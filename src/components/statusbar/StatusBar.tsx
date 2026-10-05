import { cn } from "../../lib/utils/cn";
import type { ToolchainStatus } from "../../lib/ipc/types";

type StatusBarProps = {
  operationError?: string | null;
  onOpenErrors?: () => void;
  workspacePath: string | null;
  activeFilePath: string | null;
  activeSymbol?: {
    kind: string;
    name: string;
    line: number;
  } | null;
  onJumpToActiveSymbol?: () => void;
  mode: "quick-insight" | "deep-trace";
  runtimeAvailability: "available" | "unavailable" | "degraded";
  diagnosticsAvailability: "available" | "unavailable" | "idle";
  completionAvailability: "available" | "degraded" | "idle";
  toolchainStatus?: ToolchainStatus | null;
  toolchainError?: string | null;
  toolchainChecking?: boolean;
  onOpenToolchain?: () => void;
  saveStatus?: "idle" | "saving" | "saved" | "error";
  runStatus?: "idle" | "running" | "done" | "error";
  branchName?: string | null;
  onToggleBranchPicker?: () => void;
  isBottomPanelOpen: boolean;
  onToggleBottomPanel: () => void;
  selectedLine?: number | null;
  selectedColumn?: number | null;
  tabSize?: number;
};

function StatusBar({
  operationError, onOpenErrors,
  workspacePath,
  activeFilePath,
  activeSymbol = null,
  onJumpToActiveSymbol,
  mode,
  runtimeAvailability,
  diagnosticsAvailability,
  completionAvailability,
  toolchainStatus = null,
  toolchainError = null,
  toolchainChecking = false,
  onOpenToolchain,
  saveStatus = "idle",
  runStatus = "idle",
  branchName,
  onToggleBranchPicker,
  isBottomPanelOpen,
  onToggleBottomPanel,
  selectedLine,
  selectedColumn,
  tabSize = 4,
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
  const pillOk = "text-(--green)";
  const pillWarn = "text-[var(--yellow)]";
  const pillIdle = "text-[var(--overlay1)]";
  const workspaceOpen = workspacePath !== null;

  const healthStates = [
    runtimeAvailability === "available",
    diagnosticsAvailability === "available" || diagnosticsAvailability === "idle",
    completionAvailability === "available" || completionAvailability === "idle",
    toolchainStatus !== null && missingTools.length === 0,
  ];
  const healthOkCount = healthStates.filter(Boolean).length;

  return (
    <footer className="relative z-50 flex h-7 items-center justify-between border-t border-[var(--border-structural)] bg-[var(--surface-chrome)] backdrop-blur-[12px] px-2.5 text-[11px] font-medium text-[var(--subtext0)] select-none">
      <div className="flex items-center gap-2.5 overflow-hidden">
        <div className="flex items-center gap-1.5">
          <span className={cn("flex size-1.5 rounded-full", workspaceOpen ? "bg-(--green)" : "bg-(--overlay1)")}></span>
          <span className="max-w-[140px] truncate font-semibold text-[var(--subtext1)] tabular-nums">
            {workspacePath ? workspacePath.split(/[\\/]/).pop() : "No Workspace"}
          </span>
        </div>
        <div className="flex items-center gap-1 text-[var(--overlay1)]">
          <span className="text-[var(--surface2)]">/</span>
          <span className="max-w-[200px] truncate">{activeFilePath ?? "IDLE"}</span>
        </div>
        {branchName && onToggleBranchPicker && (
          <button
            type="button"
            aria-label="Switch branch"
            className="flex items-center gap-1 rounded px-1.5 py-0.5 font-medium text-[var(--subtext1)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)] transition-colors"
            onClick={onToggleBranchPicker}
          >
            <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="6" y1="3" x2="6" y2="15" />
              <circle cx="18" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <path d="M18 9a9 9 0 0 1-9 9" />
            </svg>
            <span>{branchName}</span>
          </button>
        )}
        {activeSymbol && onJumpToActiveSymbol && (
          <div
            data-testid="status-bar-symbol-indicator"
            className="flex items-center gap-1 text-[var(--overlay1)]"
          >
            <span className="text-[var(--surface2)]">/</span>
            <button
              type="button"
              aria-label="Jump to active symbol"
              className="flex min-w-0 items-center gap-1.5 rounded px-1.5 py-0.5 text-left font-medium text-[var(--subtext1)] transition-colors duration-100 hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
              onClick={onJumpToActiveSymbol}
              title={`Jump to ${activeSymbol.name} on line ${activeSymbol.line}.`}
            >
              <span className="rounded bg-[var(--surface0)] px-1 py-0.2 uppercase tracking-[0.04em] text-[9px] text-[var(--overlay1)]">
                {activeSymbol.kind}
              </span>
              <span className="max-w-[140px] truncate">{activeSymbol.name}</span>
              <span className="text-[rgba(113,125,144,0.6)]">L{activeSymbol.line}</span>
            </button>
          </div>
        )}
      </div>

      <div className="ml-auto flex items-center gap-1 pr-0.5">
        {operationError && <button type="button" aria-label="Show application error" onClick={onOpenErrors} title={operationError} className="max-w-60 truncate border border-(--red) px-2 py-0.5 text-(--red)"><span role="status">{operationError}</span></button>}
        <div className="flex items-center gap-0.5">
          <span className="flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[var(--subtext0)]">
            <span
              className={cn("size-1 rounded-full", mode === "deep-trace" ? "bg-(--blue)" : "bg-(--overlay2)")}
            ></span>
            {modeLabel}
            <span className="sr-only">Mode: {modeLabel}</span>
          </span>
          {runtimeAvailability !== "unavailable" && (
            <span
              title={`Runtime: ${runtimeLabel}`}
              className={cn(
                "rounded px-1.5 py-0.5 transition-colors hover:bg-[var(--bg-hover)]",
                runtimeAvailability === "available"
                  ? "text-(--green)"
                  : "text-(--yellow)"
              )}
            >
              Runtime: {runtimeLabel}
            </span>
          )}
          {diagnosticsAvailability !== "available" && (
            <span
              title={
                diagnosticsAvailability === "unavailable"
                  ? "gopls is unavailable. Install gopls to restore diagnostics."
                  : "Diagnostics have not been checked for the active file."
              }
              className={cn(
                "rounded px-1.5 py-0.5 transition-colors hover:bg-[var(--bg-hover)]",
                diagnosticsAvailability === "unavailable"
                  ? "text-(--yellow)"
                  : "text-(--overlay1)"
              )}
            >
              {diagnosticsLabel}
            </span>
          )}
          {completionAvailability !== "idle" && (
            <span
              title={
                completionAvailability === "degraded"
                  ? "Completion backend is unavailable. Editing still works; retry completions after the language service recovers."
                  : "Completion backend is available."
              }
              className={cn(
                "rounded px-1.5 py-0.5 transition-colors hover:bg-[var(--bg-hover)]",
                completionAvailability === "degraded"
                  ? "text-(--yellow)"
                  : "text-(--green)"
              )}
            >
              {completionLabel}
            </span>
          )}
          <span
            title={`Runtime: ${runtimeLabel}\nDiagnostics: ${diagnosticsLabel}\nCompletion: ${completionLabel}\nToolchain: ${toolsLabel}`}
            className={cn(
              "rounded px-1.5 py-0.5 font-medium transition-colors hover:bg-[var(--bg-hover)]",
              healthOkCount >= 3 ? pillOk : healthOkCount >= 2 ? pillWarn : pillIdle
            )}
          >
            Health {healthOkCount}/4
          </span>
          {onOpenToolchain && (
            <button
              type="button"
              aria-label="Inspect Go toolchain"
              onClick={onOpenToolchain}
              title={toolchainError ?? "Inspect executable paths, versions and native tool errors."}
              className={cn(
                "rounded px-1.5 py-0.5 font-medium transition-colors hover:bg-[var(--bg-hover)]",
                toolchainError ? pillWarn : pillIdle
              )}
            >
              {toolchainChecking ? "Tools…" : toolchainError ? "Tools Retry" : toolsLabel}
            </button>
          )}
        </div>

        <div className="flex items-center ml-1 border-l border-[var(--border-structural)] pl-1.5">
          <button
            type="button"
            aria-label={isBottomPanelOpen ? "Hide terminal panel" : "Show terminal panel"}
            title="Show or hide the Logs and Shell terminal panel for the active editor session."
            className={cn(
              "rounded px-2 py-0.5 text-[11px] font-medium tracking-wide transition-colors duration-100",
              isBottomPanelOpen
                ? "bg-[var(--surface1)] text-[var(--text)] font-semibold"
                : "text-[var(--subtext0)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
            )}
            onClick={onToggleBottomPanel}
          >
            TERM
          </button>
        </div>

        {activeFilePath && (
          <div className="flex items-center gap-2 border-l border-[var(--border-structural)] pl-2 text-[11px] text-[var(--overlay1)] font-mono">
            <span>Ln {selectedLine ?? 1}, Col {selectedColumn ?? 1}</span>
            <span className="hidden sm:inline">Spaces: {tabSize}</span>
            <span className="hidden md:inline">UTF-8</span>
            <span className="font-sans font-medium text-[var(--subtext0)]">
              {activeFilePath.endsWith(".go")
                ? "Go"
                : activeFilePath.endsWith(".md")
                  ? "Markdown"
                  : activeFilePath.endsWith(".json")
                    ? "JSON"
                    : "Plain Text"}
            </span>
          </div>
        )}

        <div className="ml-1 flex min-w-0 items-center justify-end gap-2 tabular-nums">
          <span className="font-semibold text-(--overlay2)">
            {saveStatus === "saving"
              ? "SYNCING..."
              : saveStatus === "saved"
                ? "READY"
                : saveStatus === "error"
                  ? "FAULT"
                  : ""}
          </span>
          <span className={cn("font-semibold", runStatus === "running" && "text-(--green)")}>
            {runStatus === "running" ? "LIVE" : ""}
          </span>
        </div>
      </div>
    </footer>
  );
}

export default StatusBar;
