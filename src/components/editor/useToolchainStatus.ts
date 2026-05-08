import { useEffect, useState } from "react";
import { getToolchainStatus } from "../../lib/ipc/client";
import type { ToolchainStatus } from "../../lib/ipc/types";

export function useToolchainStatus(): ToolchainStatus | null {
  const [toolchainStatus, setToolchainStatus] = useState<ToolchainStatus | null>(null);

  useEffect(() => {
    let canceled = false;
    const runPreflight = async () => {
      const response = await getToolchainStatus();
      if (!canceled && response.ok && response.data) {
        setToolchainStatus(response.data);
      }
    };

    void runPreflight();

    return () => {
      canceled = true;
    };
  }, []);

  return toolchainStatus;
}
