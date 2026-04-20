import type {
  DebuggerState,
  RuntimePanelSnapshot,
  RuntimeTopologyInteraction,
  RuntimeTopologySnapshot,
} from "../../lib/ipc/types";

type RuntimeTopologyPanelProps = {
  loading?: boolean;
  runMode: "standard" | "race" | "debug";
  runStatus: "idle" | "running" | "done" | "error";
  debuggerState: DebuggerState | null;
  panelSnapshot: RuntimePanelSnapshot | null;
  topologySnapshot: RuntimeTopologySnapshot | null;
  error?: string | null;
};

function confidenceClass(confidence: RuntimeTopologyInteraction["confidence"]): string {
  switch (confidence) {
    case "confirmed":
      return "text-[var(--green)]";
    case "likely":
      return "text-[var(--yellow)]";
    default:
      return "text-[var(--overlay1)]";
  }
}

function RuntimeTopologyPanel({
  loading = false,
  runMode,
  runStatus,
  debuggerState,
  panelSnapshot,
  topologySnapshot,
  error = null,
}: RuntimeTopologyPanelProps) {
  const sessionActive = runMode === "debug" && runStatus === "running";
  const interactions = topologySnapshot?.interactions ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-[var(--border-muted)] px-4 py-3">
        <p className="text-[12px] font-semibold uppercase text-[var(--overlay1)] text-balance">
          Runtime Topology
        </p>
        <p className="mt-1 text-[12px] text-[var(--subtext0)]">
          {sessionActive
            ? debuggerState?.paused
              ? "Debugger paused"
              : "Debugger running"
            : "No active debug session"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 border-b border-[var(--border-subtle)] p-3">
        <div className="rounded border border-[var(--border-subtle)] bg-[var(--crust)] px-2 py-1.5">
          <p className="text-[10px] uppercase text-[var(--overlay1)]">Goroutines</p>
          <p className="mt-0.5 text-[13px] font-semibold text-[var(--subtext1)]">
            {panelSnapshot?.goroutineCount ?? 0}
          </p>
        </div>
        <div className="rounded border border-[var(--border-subtle)] bg-[var(--crust)] px-2 py-1.5">
          <p className="text-[10px] uppercase text-[var(--overlay1)]">Blocked</p>
          <p className="mt-0.5 text-[13px] font-semibold text-[var(--subtext1)]">
            {panelSnapshot?.blockedCount ?? 0}
          </p>
        </div>
      </div>
      {debuggerState?.activeRelativePath && debuggerState.activeLine && (
        <div className="border-b border-[var(--border-subtle)] px-3 py-2">
          <p className="text-[10px] uppercase text-[var(--overlay1)]">Execution Context</p>
          <p className="mt-1 truncate text-[11px] text-[var(--subtext0)]">
            {debuggerState.activeRelativePath}:{debuggerState.activeLine}
            {debuggerState.activeColumn ? `:${debuggerState.activeColumn}` : ""}
          </p>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto p-2">
        {loading && (
          <p className="px-2 py-2 text-[12px] text-[var(--overlay1)]">Refreshing runtime graph…</p>
        )}
        {error && (
          <p className="px-2 py-2 text-[12px] text-[var(--overlay1)]">Runtime data unavailable.</p>
        )}
        {!loading && !error && !sessionActive && (
          <div className="px-2 py-3 text-[12px] text-[var(--overlay1)]">
            Start debugging to inspect goroutine state, waits, and runtime edges.
          </div>
        )}
        {!loading && !error && sessionActive && interactions.length === 0 && (
          <div className="px-2 py-3 text-[12px] text-[var(--overlay1)]">
            Session active. Waiting for runtime interaction samples.
          </div>
        )}
        {!loading && !error && interactions.length > 0 && (
          <div className="space-y-2">
            {interactions.map((interaction) => (
              <div
                key={`${interaction.threadId}:${interaction.source}:${interaction.waitReason}`}
                className="rounded border border-[var(--border-subtle)] bg-[rgba(49,53,68,0.45)] px-2.5 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-[12px] font-semibold text-[var(--subtext1)]">
                    g#{interaction.threadId} · {interaction.kind}
                  </p>
                  <span className={`text-[11px] font-semibold uppercase ${confidenceClass(interaction.confidence)}`}>
                    {interaction.confidence}
                  </span>
                </div>
                <p className="mt-1 truncate text-[11px] text-[var(--subtext0)]">{interaction.source}</p>
                {interaction.target && (
                  <p className="mt-0.5 truncate text-[11px] text-[var(--overlay1)]">→ {interaction.target}</p>
                )}
                <p className="mt-1 truncate text-[11px] text-[var(--overlay1)]">
                  wait: {interaction.waitReason}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default RuntimeTopologyPanel;
