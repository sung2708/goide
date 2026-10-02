import { useCallback, useEffect, useRef, useState } from "react";
import { getToolchainStatus } from "../../lib/ipc/client";
import type { ToolchainStatus } from "../../lib/ipc/types";

export function useToolchainStatus() {
  const [status, setStatus] = useState<ToolchainStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const id = ++generation.current; setStatus(null); setError(null); setChecking(true);
    try {
      const response = await getToolchainStatus();
      if (id !== generation.current) return;
      if (!response.ok || !response.data) throw new Error(response.error?.message ?? "Toolchain status unavailable.");
      setStatus(response.data);
    } catch (failure) { if (id === generation.current) setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { if (id === generation.current) setChecking(false); }
  }, []);
  useEffect(() => { void refresh(); return () => { generation.current++; }; }, [refresh]);
  return { status, error, checking, refresh };
}
