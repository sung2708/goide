import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cancelLanguageRequest, inspectGoProject } from "../../lib/ipc/client";
import type { GoProjectInfo, GoProjectRequest } from "../../lib/ipc/types";
import { useSettings } from "../settings/useSettings";
import { configureInOrder } from "../settings/toolchainConfiguration";

export function useGoProjectInfo(open: boolean, root: string | null, relativeDirectory: string) {
  const { values } = useSettings();
  const paths = useMemo(() => ({ go: values["go.executablePath"], gopls: values["go.goplsPath"], dlv: values["debug.delvePath"] }), [values["go.executablePath"], values["go.goplsPath"], values["debug.delvePath"]]);
  const [info, setInfo] = useState<GoProjectInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const generation = useRef(0), active = useRef<GoProjectRequest | null>(null), mounted = useRef(true);
  const cancel = useCallback(() => {
    generation.current++; setChecking(false);
    const request = active.current; active.current = null;
    if (request) void cancelLanguageRequest(request).then(response => {
      if (!response.ok && mounted.current) setError(response.error?.message ?? "Go project cancellation failed.");
    }).catch(failure => { if (mounted.current) setError(String(failure)); });
  }, []);
  const refresh = useCallback(async () => {
    cancel(); setInfo(null); setError(null);
    if (!open || !root) return;
    const id = generation.current; setChecking(true);
    const request = { workspaceRoot: root, relativeDirectory, requestId: crypto.randomUUID() };
    try {
      const configuration = await configureInOrder(paths, () => id === generation.current);
      if (id !== generation.current) return;
      if (!configuration?.ok) throw new Error(configuration?.error?.message ?? "Tool configuration failed; correct Settings and retry.");
      active.current = request;
      const response = await inspectGoProject(request);
      if (id !== generation.current) return;
      if (!response.ok || !response.data) throw new Error(response.error?.message ?? "Go project information unavailable.");
      setInfo(response.data);
    } catch (failure) { if (id === generation.current) setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { if (active.current?.requestId === request.requestId) active.current = null; if (id === generation.current) setChecking(false); }
  }, [cancel, open, root, relativeDirectory, paths]);
  useEffect(() => { void refresh(); return cancel; }, [refresh, cancel]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  return { info, error, checking, refresh, cancel };
}
