import { useEffect, useRef, useState } from "react";
import type { ApiResponse } from "../../lib/ipc/types";

// Hide the old stop's values immediately when execution control is requested,
// while the debugger's actual paused/running state remains owned by native DAP.
export function useInspectionGate(token: string | null | undefined) {
  const [blocked, setBlocked] = useState<string | null>(null);
  const [inFlight, setInFlight] = useState(false);
  const active = useRef(token); active.current = token;
  const busy = useRef(false);
  const blockedRef = useRef<string | null>(null);
  const generation = useRef(0);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current += 1; }; }, []);
  const control = async <T,>(operation: () => Promise<ApiResponse<T>>): Promise<ApiResponse<T>> => {
    if (busy.current || (blockedRef.current !== null && blockedRef.current === active.current)) return { ok: false, error: { code: "debugger_control_pending", message: "Wait for the debugger's observed state before another control request." } };
    const captured = active.current ?? null;
    const request = ++generation.current;
    busy.current = true; blockedRef.current = captured; setInFlight(true); setBlocked(captured);
    try {
      const result = await operation();
      if (!result.ok && mounted.current && generation.current === request) { blockedRef.current = null; setBlocked(null); }
      return result;
    } catch (error) {
      if (mounted.current && generation.current === request) { blockedRef.current = null; setBlocked(null); }
      throw error;
    } finally {
      if (mounted.current && generation.current === request) { busy.current = false; setInFlight(false); }
    }
  };
  const pending = inFlight || (blocked !== null && blocked === token);
  return { token: pending ? null : token ?? null, pending, control, generation };
}
