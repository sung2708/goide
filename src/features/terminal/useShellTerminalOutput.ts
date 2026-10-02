import { useCallback, useEffect, useRef } from "react";
import type { Terminal } from "@xterm/xterm";
export function useShellTerminalOutput() {
  const terminalRef = useRef<Terminal | null>(null);
  const pendingOutputBufferRef = useRef<string[]>([]);
  const pendingOutputFlushHandleRef = useRef<number | null>(null);
  const flushTerminalWrites = useCallback(() => {
    pendingOutputFlushHandleRef.current = null;
    const terminal = terminalRef.current;
    if (!terminal) {
      return;
    }
    const chunks = pendingOutputBufferRef.current;
    if (chunks.length === 0) {
      return;
    }
    pendingOutputBufferRef.current = [];
    terminal.write(chunks.join(""));
  }, []);

  const scheduleTerminalFlush = useCallback(() => {
    if (pendingOutputFlushHandleRef.current !== null) {
      return;
    }
    pendingOutputFlushHandleRef.current = window.requestAnimationFrame(() => {
      flushTerminalWrites();
    });
  }, [flushTerminalWrites]);

  const enqueueTerminalWrite = useCallback(
    (chunk: string) => {
      if (!chunk) {
        return;
      }
      pendingOutputBufferRef.current.push(chunk);
      scheduleTerminalFlush();
    },
    [scheduleTerminalFlush]
  );

  const clearPendingTerminalWrites = useCallback(() => {
    if (pendingOutputFlushHandleRef.current !== null) {
      window.cancelAnimationFrame(pendingOutputFlushHandleRef.current);
      pendingOutputFlushHandleRef.current = null;
    }
    pendingOutputBufferRef.current = [];
  }, []);

  useEffect(() => clearPendingTerminalWrites, [clearPendingTerminalWrites]);
  return { terminalRef, pendingOutputBufferRef, scheduleTerminalFlush, enqueueTerminalWrite, clearPendingTerminalWrites };
}
