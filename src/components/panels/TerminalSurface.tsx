import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import type { ITerminalInitOnlyOptions, ITerminalOptions } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

type TerminalCtorOptions = ITerminalOptions & ITerminalInitOnlyOptions;

const DEFAULT_OPTIONS: TerminalCtorOptions = {
  convertEol: true,
  cursorBlink: true,
  fontSize: 13,
  fontFamily: '"Fira Code", "Cascadia Code", "Menlo", monospace',
  theme: {
    background: "#1e1e2e",
    foreground: "#cdd6f4",
    cursor: "#f5e0dc",
    selectionBackground: "#585b70",
  },
  cols: 120,
  rows: 40,
  scrollback: 5000,
};

export type TerminalFocusOwner = "editor" | "terminal";

export type TerminalSurfaceProps = {
  /** Called once the terminal is mounted, giving the caller access to the Terminal instance. */
  onMount?: (terminal: Terminal) => void;
  /** When true, the terminal does not accept keyboard input from the user. */
  readOnly?: boolean;
  /** Optional callback invoked when the user types a character (only when readOnly is false). */
  onData?: (data: string) => void;
  /** Optional callback invoked after each fit-addon resize cycle. */
  onResize?: (cols: number, rows: number) => void;
  /** Optional callback for terminal/editor focus ownership transitions. */
  onFocusOwnerChange?: (owner: TerminalFocusOwner) => void;
  /**
   * Optional terminal options merged on top of the component defaults.
   * Lets callers override individual settings (e.g. fontSize, scrollback)
   * without forking TerminalSurface.
   */
  options?: TerminalCtorOptions;
  className?: string;
};

/**
 * TerminalSurface — shared xterm.js lifecycle wrapper.
 *
 * Mounts an xterm Terminal into a DOM container, attaches the FitAddon, and
 * handles teardown on unmount.  All callers (LogsTerminalView, interactive
 * shell, etc.) compose this component rather than managing the Terminal
 * lifecycle themselves.
 *
 * React StrictMode safety: the container is cleared before each open() call
 * so that a double-mount does not stack stale xterm DOM elements.
 *
 * NOTE — prop changes after the initial mount are intentionally ignored.
 * The setup effect runs only once (empty dependency array) so that the
 * Terminal is constructed and opened exactly once per React mount.  Callers
 * must pass stable values for `onMount`, `onData`, `onResize`, `readOnly`,
 * and `options`; changing them after mount has no effect on the live terminal.
 *
 * INIT FAILURE FALLBACK:
 * If the xterm constructor, loadAddon, or open() call throws, the component
 * catches the error and renders a local inline fallback message instead of
 * propagating the error to the React tree.  This prevents the entire subtree
 * from unmounting due to a terminal renderer failure (e.g. WebGL unavailable,
 * jsdom constraints in tests, missing DOM APIs).
 */
function TerminalSurface({
  onMount,
  readOnly = false,
  onData,
  onResize,
  onFocusOwnerChange,
  options,
  className,
}: TerminalSurfaceProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Clear any stale xterm DOM from a previous mount (handles StrictMode
    // double-invocation and any other scenario where the container is reused).
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    let terminal: Terminal | null = null;
    let fitAddon: FitAddon | null = null;
    let dataDisposable: { dispose: () => void } | null = null;
    let resizeObserver: ResizeObserver | null = null;

    try {
      const resolvedOptions: TerminalCtorOptions = {
        ...DEFAULT_OPTIONS,
        disableStdin: readOnly,
        cursorBlink: !readOnly,
        ...options,
      };

      terminal = new Terminal(resolvedOptions);

      fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.open(container);

      // Fit after open so the terminal sizes to its container
      try {
        fitAddon.fit();
      } catch {
        // fit() can throw in jsdom/test environments — safe to ignore
      }

      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;

      // Forward user input unless read-only
      if (!readOnly && onData) {
        dataDisposable = terminal.onData(onData);
      }

      onMount?.(terminal);

      // Resize observer to re-fit when the container changes size
      resizeObserver = new ResizeObserver(() => {
        try {
          fitAddon?.fit();
          if (terminal) {
            onResize?.(terminal.cols, terminal.rows);
          }
        } catch {
          // safe to ignore in test environments
        }
      });
      resizeObserver.observe(container);
    } catch (err) {
      // Terminal renderer init failed — show a local fallback message instead
      // of propagating the error to the React tree.
      const message =
        err instanceof Error ? err.message : "Unknown terminal initialization error.";
      setInitError(message);
      // Clean up any partially-constructed resources.
      try {
        terminal?.dispose();
      } catch {
        // best-effort
      }
      terminalRef.current = null;
      fitAddonRef.current = null;
    }

    return () => {
      dataDisposable?.dispose();
      resizeObserver?.disconnect();
      if (terminalRef.current) {
        terminalRef.current.dispose();
        terminalRef.current = null;
      }
      fitAddonRef.current = null;
      // Clear the container on cleanup so the next mount starts clean
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (initError !== null) {
    return (
      <div
        className={className}
        style={{ width: "100%", height: "100%" }}
        data-testid="terminal-init-error"
        role="alert"
      >
        <div className="flex h-full items-center justify-center">
          <p className="text-[12px] text-[var(--red)] italic">
            Terminal failed to initialize.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      data-testid="terminal-surface-host"
      className={className}
      style={{ width: "100%", height: "100%" }}
      onFocus={() => onFocusOwnerChange?.("terminal")}
      onBlur={() => onFocusOwnerChange?.("editor")}
    />
  );
}

export default TerminalSurface;
