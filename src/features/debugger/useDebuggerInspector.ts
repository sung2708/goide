import { useCallback, useEffect, useRef, useState } from "react";
import { queryDebuggerInspection } from "../../lib/ipc/client";
import type { DebuggerFrame, DebuggerScope, DebuggerThread, DebuggerInspectionQuery } from "../../lib/ipc/types";

export type InspectionContext = { root: string; token: string };
export const contextKey = (context: InspectionContext | null) => context ? `${context.root}\0${context.token}` : "";
type View = {
  key: string; threads: DebuggerThread[]; frames: DebuggerFrame[]; scopes: DebuggerScope[];
  thread: number | null; frame: number | null; busy: boolean; error: string | null; notice: string | null;
};
const empty = (key: string): View => ({ key, threads: [], frames: [], scopes: [], thread: null, frame: null, busy: false, error: null, notice: null });
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

export function useDebuggerInspector(context: InspectionContext | null, navigate: (frame: DebuggerFrame) => void) {
  const [view, setView] = useState<View>(() => empty(contextKey(context)));
  const owner = useRef(context); owner.current = context;
  const mounted = useRef(false);
  const generation = useRef(0);
  const navigateRef = useRef(navigate); navigateRef.current = navigate;
  const key = contextKey(context);
  const current = view.key === key ? view : empty(key);

  const load = useCallback(async (query: DebuggerInspectionQuery, expected: InspectionContext, request: number) => {
    const response = await queryDebuggerInspection({ workspaceRoot: expected.root, stopToken: expected.token, query });
    if (!mounted.current || generation.current !== request || contextKey(owner.current) !== contextKey(expected)) return null;
    if (!response.ok || !response.data) throw new Error(response.error?.message ?? "Debugger inspection is unavailable.");
    if (response.data.kind !== query.kind || response.data.stopToken !== expected.token) throw new Error("Debugger inspection changed; refresh after the next stop.");
    return response.data;
  }, []);

  const inspectFrame = useCallback(async (frame: DebuggerFrame, expected: InspectionContext, request: number, navigateSource: boolean) => {
    if (navigateSource && mounted.current && generation.current === request && contextKey(owner.current) === contextKey(expected)) navigateRef.current(frame);
    const scopes = await load({ kind: "scopes", frameId: frame.id }, expected, request);
    if (!scopes || scopes.kind !== "scopes" || generation.current !== request || contextKey(owner.current) !== contextKey(expected)) return;
    setView(previous => previous.key !== contextKey(expected) ? previous : ({ ...previous, scopes: scopes.items, busy: false, notice: scopes.limited ? "Showing the first 32 scopes." : previous.notice }));
  }, [load]);

  const inspectThread = useCallback(async (threadId: number, expected: InspectionContext, request: number) => {
    const stack = await load({ kind: "stack", threadId }, expected, request);
    if (!stack || stack.kind !== "stack" || generation.current !== request || contextKey(owner.current) !== contextKey(expected)) return;
    const first = stack.items[0];
    setView(previous => previous.key !== contextKey(expected) ? previous : ({ ...previous, frames: stack.items, frame: first?.id ?? null, notice: stack.limited ? "Showing the first 100 stack frames." : previous.notice, busy: !!first }));
    if (first) await inspectFrame(first, expected, request, false);
  }, [inspectFrame, load]);

  const refresh = useCallback(async () => {
    const expected = owner.current;
    if (!expected) return;
    const request = ++generation.current;
    setView({ ...empty(contextKey(expected)), busy: true });
    try {
      const threads = await load({ kind: "threads" }, expected, request);
      if (!threads || threads.kind !== "threads" || generation.current !== request || contextKey(owner.current) !== contextKey(expected)) return;
      const selected = threads.items.find(thread => thread.id === threads.selectedThreadId)?.id
        ?? threads.items.find(thread => thread.id !== null)?.id ?? null;
      setView(previous => previous.key !== contextKey(expected) ? previous : ({ ...previous, threads: threads.items, thread: selected, busy: selected !== null, notice: threads.limited ? "Showing the first 512 goroutines." : null }));
      if (selected !== null) await inspectThread(selected, expected, request);
    } catch (error) {
      if (mounted.current && generation.current === request && contextKey(owner.current) === contextKey(expected)) setView(previous => ({ ...previous, busy: false, error: errorMessage(error) }));
    }
  }, [inspectThread, load]);

  const selectThread = useCallback(async (threadId: number) => {
    const expected = owner.current;
    if (!expected) return;
    const request = ++generation.current;
    setView(previous => ({ ...previous, thread: threadId, frame: null, frames: [], scopes: [], error: null, busy: true }));
    try { await inspectThread(threadId, expected, request); }
    catch (error) { if (mounted.current && generation.current === request && contextKey(owner.current) === contextKey(expected)) setView(previous => ({ ...previous, busy: false, error: errorMessage(error) })); }
  }, [inspectThread]);

  const selectFrame = useCallback(async (frame: DebuggerFrame) => {
    const expected = owner.current;
    if (!expected) return;
    const request = ++generation.current;
    setView(previous => ({ ...previous, frame: frame.id, scopes: [], error: null, busy: true }));
    try { await inspectFrame(frame, expected, request, true); }
    catch (error) { if (mounted.current && generation.current === request && contextKey(owner.current) === contextKey(expected)) setView(previous => ({ ...previous, busy: false, error: errorMessage(error) })); }
  }, [inspectFrame]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => { mounted.current = false; generation.current += 1; };
  }, [key, refresh]);
  return { ...current, refresh, selectThread, selectFrame };
}
