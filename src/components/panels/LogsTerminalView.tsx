import { useEffect, useRef } from "react";
import type { Terminal } from "@xterm/xterm";
import type { RunOutputPayload } from "../../lib/ipc/types";
import TerminalSurface from "./TerminalSurface";

type LogsTerminalViewProps = {
  /** The run output entries to replay into the terminal. */
  entries: RunOutputPayload[];
  className?: string;
};

/**
 * Converts a slice of RunOutputPayload entries into a single string ready for
 * one xterm write call, appending \r\n after each line.
 */
function entriesToText(entries: RunOutputPayload[]): string {
  return entries.map((e) => `${e.line}\r\n`).join("");
}

/**
 * LogsTerminalView — read-only xterm surface that replays RunOutputPayload
 * entries, preserving ANSI escape sequences for colored output.
 *
 * Each entry's `line` is written followed by `\r\n` so xterm renders it on
 * its own line regardless of convertEol settings.
 *
 * Reset behavior: if `entries` is replaced with a shorter array, or with an
 * array whose first entry carries a different runId than the previously seen
 * runId (indicating a new run even with the same or greater length), the
 * terminal is cleared and all entries are replayed from the beginning.
 *
 * All writes are batched into a single terminal.write() call per update to
 * avoid excessive IPC with the xterm renderer.
 */
function LogsTerminalView({ entries, className }: LogsTerminalViewProps) {
  const terminalRef = useRef<Terminal | null>(null);
  // Track how many entries have been written to avoid replaying everything
  const writtenCountRef = useRef(0);
  // Track the runId of the most-recently-written batch so we can detect
  // when a new run begins even without a length decrease
  const lastRunIdRef = useRef<string | null>(null);

  // Called once by TerminalSurface after the xterm Terminal is mounted.
  // We capture the terminal instance and do the initial replay here so that
  // the first render writes immediately without waiting for the useEffect.
  function handleMount(terminal: Terminal) {
    terminalRef.current = terminal;
    if (entries.length > 0) {
      terminal.write(entriesToText(entries));
      lastRunIdRef.current = entries[0].runId;
    }
    writtenCountRef.current = entries.length;
  }

  // Write new entries that arrive after mount; reset when entries shrink or
  // when the leading runId changes (signals a new run replacing the old one).
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;

    const currentRunId = entries.length > 0 ? entries[0].runId : null;
    const runChanged = currentRunId !== null && currentRunId !== lastRunIdRef.current;
    const needsReset = entries.length < writtenCountRef.current || runChanged;

    if (needsReset) {
      // Entries array was replaced with a shorter or different-run array —
      // clear the terminal and replay all entries from scratch.
      terminal.clear();
      writtenCountRef.current = 0;
      lastRunIdRef.current = currentRunId;
      if (entries.length > 0) {
        terminal.write(entriesToText(entries));
      }
      writtenCountRef.current = entries.length;
    } else {
      // Normal incremental append — write only the newly added entries in
      // one batched call to minimise xterm write overhead.
      const newEntries = entries.slice(writtenCountRef.current);
      if (newEntries.length > 0) {
        terminal.write(entriesToText(newEntries));
        lastRunIdRef.current = currentRunId;
      }
      writtenCountRef.current = entries.length;
    }
  }, [entries]);

  return (
    <TerminalSurface
      readOnly
      onMount={handleMount}
      className={className}
    />
  );
}

export default LogsTerminalView;
