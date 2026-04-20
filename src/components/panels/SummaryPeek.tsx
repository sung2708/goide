import { type ConcurrencyConfidence } from "../../lib/ipc/types";
import { cn } from "../../lib/utils/cn";

export type SummaryItem = {
  line: number;
  label: string;
  confidence: ConcurrencyConfidence;
  symbol?: string | null;
};

export type SummaryMetric = {
  label: string;
  value: string;
  tone?: "primary" | "secondary" | "tertiary" | "error";
};

export type SummaryAlert = {
  title: string;
  detail: string;
  status: string;
  tone: "error" | "warning" | "info";
  line?: number | null;
};

export type RuntimeTopologyInteraction = {
  threadId: number;
  kind: string;
  waitReason: string;
  source: string;
  target?: string | null;
  confidence: ConcurrencyConfidence;
};

type SummaryPeekProps = {
  items?: SummaryItem[];
  alerts?: SummaryAlert[];
  metrics?: SummaryMetric[];
  topologyInteractions?: RuntimeTopologyInteraction[];
  topologyActive?: boolean;
  mode?: "quick-insight" | "deep-trace";
  hasDebugSession?: boolean;
  onJumpToLine?: (line: number) => void;
  onClose?: () => void;
};

function SummaryPeek({
  items = [],
  alerts = [],
  metrics = [],
  topologyInteractions = [],
  topologyActive = false,
  mode = "quick-insight",
  hasDebugSession = false,
  onJumpToLine,
  onClose,
}: SummaryPeekProps) {
  const hasItems = items.length > 0;
  const hasAlerts = alerts.length > 0;
  const hasMetrics = metrics.length > 0;

  const metricToneClass = (tone: SummaryMetric["tone"]) => {
    switch (tone) {
      case "secondary":
        return "text-[var(--teal)]";
      case "tertiary":
        return "text-[var(--pink)]";
      case "error":
        return "text-[var(--red)]";
      default:
        return "text-[var(--blue)]";
    }
  };

  const alertToneClass = (tone: SummaryAlert["tone"]) => {
    if (tone === "error") {
      return {
        stripe: "border-[var(--red)]",
        title: "text-[var(--red)]",
      };
    }
    if (tone === "warning") {
      return {
        stripe: "border-[var(--yellow)]",
        title: "text-[var(--yellow)]",
      };
    }
    return {
      stripe: "border-[var(--blue)]",
      title: "text-[var(--blue)]",
    };
  };

  return (
    <aside
      id="summary-panel"
      aria-label="Summary panel"
      className="z-10 flex h-full w-64 shrink-0 max-w-[340px] flex-col border-l border-[var(--border-muted)] bg-[var(--mantle)] md:w-72"
      data-testid="summary-panel"
    >
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3.5">
        <div>
          <p className="text-[11px] font-semibold uppercase text-[var(--overlay1)] text-balance">
            Concurrency Summary
          </p>
          <p className="mt-1 text-[11px] text-[var(--overlay2)] text-pretty">
            {mode === "deep-trace" ? "Deep Trace Active" : "Quick Insight"}
          </p>
          <p className="mt-1 max-w-[220px] text-[11px] leading-relaxed text-[var(--overlay1)] text-pretty">
            Summarizes in-file concurrency hints and live runtime state when a debug session is open.
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            className="cursor-pointer rounded border border-[var(--border-subtle)] px-2.5 py-1 text-[12px] text-[var(--subtext0)] transition-colors duration-100 hover:bg-[var(--bg-hover)] hover:text-[var(--subtext1)]"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onClose}
            title="Hide the summary panel."
          >
            Hide
          </button>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3 scrollbar-hide">
        {hasAlerts ? (
          <div className="space-y-2">
            {alerts.map((alert, index) => {
              const tone = alertToneClass(alert.tone);
              const canJump =
                typeof alert.line === "number" &&
                Number.isFinite(alert.line) &&
                alert.line >= 1;
              return (
                <button
                  key={`${alert.title}-${alert.status}-${index}`}
                  type="button"
                  className={cn(
                    "w-full rounded border-l-4 bg-[var(--surface0)] p-3 text-left",
                    tone.stripe,
                    canJump ? "cursor-pointer" : "cursor-default"
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    if (canJump) {
                      onJumpToLine?.(alert.line ?? 0);
                    }
                  }}
                  aria-label={`${alert.title} ${alert.status}`}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className={cn("text-[11px] font-bold uppercase", tone.title)}>
                      {alert.title}
                    </span>
                    <span className="text-[11px] text-[var(--overlay1)]">{alert.status}</span>
                  </div>
                  <p className="text-xs leading-snug text-[var(--text)]">{alert.detail}</p>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded border border-[var(--surface1)] bg-[var(--surface0)] px-3 py-3 text-[13px] text-[var(--overlay0)]">
            No active race/deadlock alerts.
            {!hasItems && (
              <p className="mt-2 italic">
                No concurrency signals detected in current scope.
              </p>
            )}
          </div>
        )}

        {hasMetrics && (
          <div className="mt-1 border-t border-[var(--border-subtle)] pt-3">
            <h4 className="mb-3 text-[11px] font-bold uppercase text-[var(--overlay1)]">
              Live Signals
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {metrics.map((metric) => (
                <div key={metric.label} className="rounded bg-[var(--crust)] p-2">
                  <span
                    className={cn(
                      "text-xs font-bold tabular-nums",
                      metricToneClass(metric.tone)
                    )}
                  >
                    {metric.value}
                  </span>
                  <span className="mt-0.5 block text-[8px] uppercase text-[var(--overlay1)]">
                    {metric.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {hasItems ? (
          <div className="mt-1 border-t border-[var(--border-subtle)] pt-3">
            <h4 className="mb-2 text-[11px] font-bold uppercase text-[var(--overlay1)]">
              Detected Constructs
            </h4>
            <div className="space-y-1">
              {items.map((item) => {
                const symbolText =
                  typeof item.symbol === "string" && item.symbol.trim().length > 0
                    ? item.symbol.trim()
                    : null;
                return (
                  <button
                    key={`${item.line}-${item.label}-${item.symbol ?? ""}`}
                    type="button"
                    className="group w-full cursor-pointer rounded p-2 text-left transition-colors duration-100 hover:bg-[var(--bg-hover)]"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onJumpToLine?.(item.line)}
                    aria-label={`Line ${item.line} ${item.label} ${item.confidence}`}
                    title={`Jump to line ${item.line}.`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="tabular-nums text-[11px] font-bold text-[var(--overlay1)]">
                        L{item.line}
                      </span>
                      <span
                        className={cn(
                          "rounded px-1 text-[11px] uppercase",
                          item.confidence === "confirmed"
                            ? "bg-[var(--signal-confirmed-bg)] text-[var(--green)]"
                            : item.confidence === "likely"
                              ? "bg-[var(--signal-likely-bg)] text-[var(--yellow)]"
                              : "bg-[var(--signal-predicted-bg)] text-[var(--overlay0)]"
                        )}
                      >
                        {item.confidence}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-col gap-0.5">
                      <span className="text-[12px] font-medium text-[var(--text)] group-hover:text-[var(--blue)] transition-colors">
                        {item.label}
                      </span>
                      {symbolText && (
                        <span className="text-[11px] text-[var(--overlay0)] font-code">
                          {symbolText}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="rounded border border-[var(--border-subtle)] bg-[var(--surface0)] px-3 py-3 shadow-sm">
          <p className="text-[11px] font-semibold uppercase text-[var(--overlay1)]">
            Runtime Topology
          </p>
          {!topologyActive ? (
            <div className="mt-3 flex flex-col items-center justify-center py-4 text-center">
              <svg className="mb-2 text-[var(--overlay0)] opacity-70" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
              <p className="text-[12px] leading-relaxed text-[var(--overlay1)] text-pretty">
                {hasDebugSession
                  ? "Pause or continue debugging to populate the runtime graph and inspect goroutine relationships."
                  : "Start Debug to see which goroutines are blocked, what they are waiting on, and what can unblock them."}
              </p>
            </div>
          ) : topologyInteractions.length === 0 ? (
            <div className="mt-3 flex flex-col items-center justify-center py-4 text-center">
              <svg className="mb-2 text-[var(--blue)] motion-safe:animate-pulse motion-reduce:animate-none" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v4"/><path d="m16.2 7.8 2.9-2.9"/><path d="M18 12h4"/><path d="m16.2 16.2 2.9 2.9"/><path d="M12 18v4"/><path d="m4.9 19.1 2.9-2.9"/><path d="M2 12h4"/><path d="m4.9 4.9 2.9 2.9"/></svg>
              <p className="text-[12px] leading-relaxed text-[var(--overlay1)] text-pretty">
                Debug session active. Waiting for more runtime samples to resolve flow and contention.
              </p>
            </div>
          ) : (
            <div className="mt-2 space-y-1.5">
              {topologyInteractions.slice(0, 12).map((item, index) => (
                <div
                  key={`${item.threadId}-${item.waitReason}-${index}`}
                  className="rounded border border-[var(--surface1)] bg-[var(--surface0)] px-2 py-1.5"
                >
                  <p className="text-[12px] font-medium text-[var(--text)]">
                    g#{item.threadId} {item.kind}
                  </p>
                  <p className="text-[11px] text-[var(--subtext0)]">{item.waitReason}</p>
                  <p className="mt-0.5 text-[11px] text-[var(--overlay1)]">
                    {item.source}
                    {item.target ? ` -> ${item.target}` : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

export default SummaryPeek;
