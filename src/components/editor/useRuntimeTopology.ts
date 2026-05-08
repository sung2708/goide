import { useEffect, useState } from "react";
import {
  getRuntimePanelSnapshot,
  getRuntimeTopologySnapshot,
} from "../../lib/ipc/client";
import type {
  RuntimePanelSnapshot,
  RuntimeTopologySnapshot,
} from "../../lib/ipc/types";

type RunMode = "standard" | "race" | "debug";
type RunStatus = "idle" | "running" | "done" | "error";

type RuntimeTopologyState = {
  runtimePanelSnapshot: RuntimePanelSnapshot | null;
  setRuntimePanelSnapshot: React.Dispatch<React.SetStateAction<RuntimePanelSnapshot | null>>;
  runtimeTopologySnapshot: RuntimeTopologySnapshot | null;
  setRuntimeTopologySnapshot: React.Dispatch<React.SetStateAction<RuntimeTopologySnapshot | null>>;
  runtimeTopologyLoading: boolean;
  runtimeTopologyError: string | null;
  setRuntimeTopologyError: React.Dispatch<React.SetStateAction<string | null>>;
};

type UseRuntimeTopologyParams = {
  runMode: RunMode;
  runStatus: RunStatus;
  nextPollingDelay: (failureCount: number) => number;
};

export function useRuntimeTopology({
  runMode,
  runStatus,
  nextPollingDelay,
}: UseRuntimeTopologyParams): RuntimeTopologyState {
  const [runtimePanelSnapshot, setRuntimePanelSnapshot] =
    useState<RuntimePanelSnapshot | null>(null);
  const [runtimeTopologySnapshot, setRuntimeTopologySnapshot] =
    useState<RuntimeTopologySnapshot | null>(null);
  const [runtimeTopologyLoading, setRuntimeTopologyLoading] = useState(false);
  const [runtimeTopologyError, setRuntimeTopologyError] = useState<string | null>(null);

  useEffect(() => {
    if (runMode !== "debug" || runStatus !== "running") {
      setRuntimePanelSnapshot(null);
      setRuntimeTopologySnapshot(null);
      setRuntimeTopologyError(null);
      setRuntimeTopologyLoading(false);
      return;
    }

    let isCancelled = false;
    let failureCount = 0;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const scheduleNextPoll = () => {
      if (isCancelled) {
        return;
      }
      timeoutId = setTimeout(() => {
        void pollRuntimeTopology();
      }, nextPollingDelay(failureCount));
    };
    const pollRuntimeTopology = async () => {
      if (isCancelled) {
        return;
      }
      setRuntimeTopologyLoading(true);
      try {
        const [panelResponse, topologyResponse] = await Promise.all([
          getRuntimePanelSnapshot(),
          getRuntimeTopologySnapshot(),
        ]);
        if (isCancelled) {
          return;
        }
        if (panelResponse.ok && panelResponse.data) {
          setRuntimePanelSnapshot(panelResponse.data);
        }
        if (topologyResponse.ok && topologyResponse.data) {
          setRuntimeTopologySnapshot(topologyResponse.data);
          setRuntimeTopologyError(null);
          failureCount = 0;
        } else {
          failureCount += 1;
          setRuntimeTopologyError(topologyResponse.error?.message ?? "Topology unavailable");
        }
      } catch (_error) {
        if (!isCancelled) {
          failureCount += 1;
          setRuntimeTopologyError("Topology unavailable");
        }
      } finally {
        if (!isCancelled) {
          setRuntimeTopologyLoading(false);
          scheduleNextPoll();
        }
      }
    };

    void pollRuntimeTopology();

    return () => {
      isCancelled = true;
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    };
  }, [nextPollingDelay, runMode, runStatus]);

  return {
    runtimePanelSnapshot,
    setRuntimePanelSnapshot,
    runtimeTopologySnapshot,
    setRuntimeTopologySnapshot,
    runtimeTopologyLoading,
    runtimeTopologyError,
    setRuntimeTopologyError,
  };
}
