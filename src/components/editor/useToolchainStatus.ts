import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getToolchainStatus } from "../../lib/ipc/client";
import { configureInOrder } from "../../features/settings/toolchainConfiguration";
import { useSettings } from "../../features/settings/useSettings";
import type { ToolchainStatus } from "../../lib/ipc/types";

export function useToolchainStatus() {
  const { values } = useSettings();
  const paths = useMemo(() => ({ go: values["go.executablePath"], gopls: values["go.goplsPath"], dlv: values["debug.delvePath"] }), [values["go.executablePath"], values["go.goplsPath"], values["debug.delvePath"]]);
  const [status, setStatus] = useState<ToolchainStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const id = ++generation.current; setStatus(null); setError(null); setChecking(true);
    try {
      const configured = await configureInOrder(paths, () => id === generation.current);
      if (id !== generation.current) return;
      if (!configured?.ok) throw new Error(`${configured?.error?.message ?? "Executable configuration failed."} Previous native tool paths remain active; correct the preference or retry after stopping run/debug.`);
      const response = await getToolchainStatus();
      if (id !== generation.current) return;
      if (!response.ok || !response.data) throw new Error(response.error?.message ?? "Toolchain status unavailable.");
      setStatus(response.data);
    } catch (failure) { if (id === generation.current) setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { if (id === generation.current) setChecking(false); }
  }, [paths]);
  useEffect(() => { void refresh(); return () => { generation.current++; }; }, [refresh]);
  return { status, error, checking, refresh };
}
