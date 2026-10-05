import { useCallback, useEffect, useRef, useState } from "react";
import { getToolchainStatus } from "../../lib/ipc/client";
import type { ToolPaths } from "../../lib/ipc/types";
import type { GitTransaction } from "../git/useSourceControl";
import { configureInOrder } from "../settings/toolchainConfiguration";

type Params = { root: string | null; paths: ToolPaths; transaction: GitTransaction; cancelSave: () => void };
type Phase = "idle" | "preparing" | "starting";
export function useExecutionPreparation(params: Params) {
  const latest = useRef(params); latest.current = params;
  const mounted = useRef(false), pending = useRef(false), cancelled = useRef(false);
  const phaseRef = useRef<Phase>("idle");
  const toolStatusCache = useRef<{ key: string; checkedAt: number; status: Awaited<ReturnType<typeof getToolchainStatus>> } | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const cancel = useCallback(() => { if (phaseRef.current === "preparing") { cancelled.current = true; latest.current.cancelSave(); } }, []);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; cancel(); }; }, [cancel]);
  const prepare = useCallback(async <T,>(operation: () => Promise<T>, required: Array<"go" | "delve">): Promise<T> => {
    if (pending.current || !latest.current.root) throw new Error("Wait for project preparation and open a workspace.");
    const owner = latest.current;
    pending.current = true; cancelled.current = false; phaseRef.current = "preparing"; setPhase("preparing");
    const current = () => mounted.current && !cancelled.current && latest.current.root === owner.root && (["go", "gopls", "dlv"] as const).every(tool => latest.current.paths[tool] === owner.paths[tool]);
    const check = () => { if (!current()) throw new Error("Execution preparation cancelled or workspace/tool preferences changed."); };
    let output: T | undefined;
    try {
      const accepted = await owner.transaction(async () => {
        check();
        const configured = await configureInOrder(owner.paths, current);
        check();
        if (!configured?.ok) throw new Error(configured?.error?.message ?? "Tool configuration failed; correct Settings before execution.");
        const key = `${owner.root}\0${owner.paths.go}\0${owner.paths.gopls}\0${owner.paths.dlv}`;
        const tools = toolStatusCache.current?.key === key && Date.now() - toolStatusCache.current.checkedAt < 30000 && required.every(name => toolStatusCache.current?.status.data?.[name]?.available && toolStatusCache.current.status.data[name].status === "ready")
          ? toolStatusCache.current.status
          : await getToolchainStatus();
        check();
        if (!tools.ok || !tools.data) throw new Error(tools.error?.message ?? "Toolchain preflight is unavailable.");
        if (required.every(name => tools.data![name]?.available && tools.data![name]?.status === "ready")) toolStatusCache.current = { key, checkedAt: Date.now(), status: tools };
        else toolStatusCache.current = null;
        for (const name of required) {
          const tool = tools.data[name];
          if (!tool.available || tool.status !== "ready") throw new Error(`${name === "delve" ? "Delve" : "Go"} preflight failed: ${tool.error ?? tool.status ?? "availability unverified"}. Check executable preferences in Settings.`);
        }
        phaseRef.current = "starting"; setPhase("starting");
        output = await operation();
      }, true, true);
      if (!accepted) throw new Error("Execution cancelled during document preservation.");
      return output as T;
    } finally {
      pending.current = false; phaseRef.current = "idle";
      if (mounted.current) setPhase("idle");
    }
  }, []);
  return { prepare, cancel, phase };
}
