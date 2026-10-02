import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import type { ITerminalInitOnlyOptions, ITerminalOptions } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

type TerminalCtorOptions = ITerminalOptions & ITerminalInitOnlyOptions;

const DEFAULT_OPTIONS: TerminalCtorOptions = {
  convertEol: true,
  cursorBlink: true,
  allowTransparency: false,
  drawBoldTextInBrightColors: false,
  minimumContrastRatio: 4.5,
  fontSize: 13,
  lineHeight: 1.35,
  letterSpacing: 0,
  fontFamily:
    '"JetBrainsMono Nerd Font", "Cascadia Code PL", "Cascadia Mono", "Cascadia Code", "Fira Code", monospace',
  theme: {
    background: "#101113",
    foreground: "#f4f5f7",
    cursor: "#f4f5f7",
    selectionBackground: "#303641",
  },
  cols: 120,
  rows: 40,
  scrollback: 10000,
};

function workspaceTerminalTheme(): ITerminalOptions["theme"] {
  const styles = getComputedStyle(document.documentElement);
  const color = (token: string, fallback: string) => styles.getPropertyValue(token).trim() || fallback;
  return {
    background: color("--terminal-background", color("--crust", "#101113")),
    foreground: color("--text", "#f4f5f7"),
    cursor: color("--text", "#f4f5f7"),
    selectionBackground: color("--terminal-selection", "#303641"),
    red: color("--red", "#ed9292"),
    green: color("--terminal-green", color("--green", "#b8cfaa")),
    yellow: color("--yellow", "#dfc58f"),
    blue: color("--blue", "#b6c9e2"),
    magenta: color("--mauve", "#c5b3df"),
    cyan: color("--sky", "#a5c7d5"),
    black: color("--terminal-black", color("--overlay0", "#80838d")),
    white: color("--terminal-white", color("--text", "#f4f5f7")),
    brightBlack: color("--overlay1", "#92949e"),
    brightRed: color("--red", "#ed9292"),
    brightGreen: color("--terminal-green", color("--green", "#b8cfaa")),
    brightYellow: color("--yellow", "#dfc58f"),
    brightBlue: color("--blue", "#b6c9e2"),
    brightMagenta: color("--mauve", "#c5b3df"),
    brightCyan: color("--sky", "#a5c7d5"),
    brightWhite: color("--terminal-white", color("--text", "#f4f5f7")),
  };
}

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
  /** Optional signal to force a re-fit when a parent tab/panel becomes visible. */
  fitRequestKey?: number;
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
  fitRequestKey,
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
    container.replaceChildren();

    let terminal: Terminal | null = null;
    let fitAddon: FitAddon | null = null;
    let dataDisposable: { dispose: () => void } | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let themeObserver: MutationObserver | null = null;
    let resizeFrameHandle: number | null = null;

    try {
      const resolvedOptions: TerminalCtorOptions = {
        ...DEFAULT_OPTIONS,
        disableStdin: readOnly,
        cursorBlink: !readOnly,
        ...options,
        theme: { ...workspaceTerminalTheme(), ...options?.theme },
      };

      terminal = new Terminal(resolvedOptions);

      fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.open(container);

      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;

      // Update the renderer in place so switching themes preserves shell sessions and output.
      themeObserver = new MutationObserver(() => {
        if (terminal) {
          terminal.options.theme = { ...workspaceTerminalTheme(), ...options?.theme };
        }
      });
      themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

      // Forward user input unless read-only
      if (!readOnly && onData) {
        dataDisposable = terminal.onData(onData);
      }

      onMount?.(terminal);

      // Fit after open via requestAnimationFrame so the terminal sizes to its
      // container once the browser has performed layout.
      resizeFrameHandle = window.requestAnimationFrame(() => {
        resizeFrameHandle = null;
        try {
          fitAddon?.fit();
        } catch {
          // fit() can throw in jsdom/test environments — safe to ignore
        }
      });

      // Resize observer to re-fit when the container changes size.
      // One fit is scheduled per animation frame (debounced).
      resizeObserver = new ResizeObserver(() => {
        if (resizeFrameHandle !== null) {
          return;
        }
        resizeFrameHandle = window.requestAnimationFrame(() => {
          resizeFrameHandle = null;
          try {
            fitAddon?.fit();
            if (terminal) {
              onResize?.(terminal.cols, terminal.rows);
            }
          } catch {
            // safe to ignore in test environments
          }
        });
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
      themeObserver?.disconnect();
    }

    return () => {
      dataDisposable?.dispose();
      resizeObserver?.disconnect();
      themeObserver?.disconnect();
      if (resizeFrameHandle !== null) {
        window.cancelAnimationFrame(resizeFrameHandle);
        resizeFrameHandle = null;
      }
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

  useEffect(() => {
    if (fitRequestKey === undefined) {
      return;
    }
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (!terminal || !fitAddon) {
      return;
    }
    const handle = window.requestAnimationFrame(() => {
      try {
        fitAddon.fit();
        onResize?.(terminal.cols, terminal.rows);
      } catch {
        // safe to ignore in test environments
      }
    });
    return () => {
      window.cancelAnimationFrame(handle);
    };
  }, [fitRequestKey, onResize]);

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
      style={{ width: "100%", height: "100%", touchAction: "none" }}
      onFocus={() => onFocusOwnerChange?.("terminal")}
      onBlur={() => onFocusOwnerChange?.("editor")}
    />
  );
}

export default TerminalSurface;
