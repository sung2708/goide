import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RunOutputPayload } from "../../lib/ipc/types";
import {
  extractGoFileLineReferences,
  pathsReferToSameRunTarget,
  toRaceFindings,
  type RaceFinding,
} from "./editorShellUtils";

export type RunMode = "standard" | "race" | "debug";
export type RunStatus = "idle" | "running" | "done" | "error";

type RaceRunCapture = {
  isRaceRun: boolean;
  sawWarning: boolean;
  matchedLines: Set<number>;
};

type RunOutputState = {
  runOutput: RunOutputPayload[];
  setRunOutput: React.Dispatch<React.SetStateAction<RunOutputPayload[]>>;
  raceSignals: RaceFinding[];
  setRaceSignals: React.Dispatch<React.SetStateAction<RaceFinding[]>>;
  activeRunIdRef: React.MutableRefObject<string | null>;
  activeRunModeRef: React.MutableRefObject<RunMode>;
  activeRunTargetFilePathRef: React.MutableRefObject<string | null>;
  raceRunCaptureRef: React.MutableRefObject<RaceRunCapture>;
  clearPendingRunOutputBuffer: () => void;
};

type UseRunOutputStateParams = {
  setRunStatus: React.Dispatch<React.SetStateAction<RunStatus>>;
};

export function useRunOutputState({
  setRunStatus,
}: UseRunOutputStateParams): RunOutputState {
  const [runOutput, setRunOutput] = useState<RunOutputPayload[]>([]);
  const [raceSignals, setRaceSignals] = useState<RaceFinding[]>([]);
  const activeRunIdRef = useRef<string | null>(null);
  const activeRunModeRef = useRef<RunMode>("standard");
  const activeRunTargetFilePathRef = useRef<string | null>(null);
  const raceRunCaptureRef = useRef<RaceRunCapture>({
    isRaceRun: false,
    sawWarning: false,
    matchedLines: new Set<number>(),
  });
  const pendingRunOutputBufferRef = useRef<RunOutputPayload[]>([]);
  const pendingRunOutputFlushHandleRef = useRef<number | null>(null);

  const flushRunOutputBuffer = useCallback(() => {
    pendingRunOutputFlushHandleRef.current = null;
    const buffered = pendingRunOutputBufferRef.current;
    if (buffered.length === 0) {
      return;
    }
    pendingRunOutputBufferRef.current = [];
    setRunOutput((prev) => [...prev, ...buffered]);
  }, []);

  const clearPendingRunOutputBuffer = useCallback(() => {
    if (pendingRunOutputFlushHandleRef.current !== null) {
      window.cancelAnimationFrame(pendingRunOutputFlushHandleRef.current);
      pendingRunOutputFlushHandleRef.current = null;
    }
    pendingRunOutputBufferRef.current = [];
  }, []);

  const scheduleRunOutputFlush = useCallback(() => {
    if (pendingRunOutputFlushHandleRef.current !== null) {
      return;
    }
    pendingRunOutputFlushHandleRef.current = window.requestAnimationFrame(() => {
      flushRunOutputBuffer();
    });
  }, [flushRunOutputBuffer]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let isUnmounted = false;

    const setupListener = async () => {
      const dispose = await listen<RunOutputPayload>("run-output", (event) => {
        if (event.payload.runId !== activeRunIdRef.current) {
          return;
        }
        const runTargetPath = activeRunTargetFilePathRef.current;
        if (activeRunModeRef.current === "race" && runTargetPath) {
          if (
            event.payload.stream === "stderr" &&
            event.payload.line.includes("WARNING: DATA RACE")
          ) {
            raceRunCaptureRef.current.sawWarning = true;
          }

          if (event.payload.stream === "stderr") {
            const refs = extractGoFileLineReferences(event.payload.line);
            for (const ref of refs) {
              if (pathsReferToSameRunTarget(ref.path, runTargetPath)) {
                raceRunCaptureRef.current.matchedLines.add(ref.line);
              }
            }
          }

          if (event.payload.stream === "exit") {
            if (
              raceRunCaptureRef.current.sawWarning &&
              raceRunCaptureRef.current.matchedLines.size > 0
            ) {
              const lines = Array.from(raceRunCaptureRef.current.matchedLines).sort(
                (left, right) => left - right
              );
              setRaceSignals(toRaceFindings(runTargetPath, lines));
            } else {
              setRaceSignals([]);
            }
          }
        }

        pendingRunOutputBufferRef.current.push(event.payload);
        scheduleRunOutputFlush();
        if (event.payload.stream === "exit") {
          setRunStatus(event.payload.exitCode === 0 ? "done" : "error");
        }
      });
      if (isUnmounted) {
        dispose();
        return;
      }
      unlisten = dispose;
    };

    setupListener();
    return () => {
      isUnmounted = true;
      if (unlisten) unlisten();
      clearPendingRunOutputBuffer();
    };
  }, [clearPendingRunOutputBuffer, scheduleRunOutputFlush, setRunStatus]);

  return {
    runOutput,
    setRunOutput,
    raceSignals,
    setRaceSignals,
    activeRunIdRef,
    activeRunModeRef,
    activeRunTargetFilePathRef,
    raceRunCaptureRef,
    clearPendingRunOutputBuffer,
  };
}
