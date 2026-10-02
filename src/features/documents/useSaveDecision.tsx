import { useCallback, useEffect, useRef, useState } from "react";
import Dialog from "../../components/primitives/Dialog";
export type SaveChoice = "save" | "discard" | "cancel";
export function useSaveDecision(root: string | null) {
  const [label, setLabel] = useState<string | null>(null);
  const pending = useRef<((choice: SaveChoice) => void) | null>(null);
  const finish = useCallback((choice: SaveChoice) => { const resolve = pending.current; pending.current = null; setLabel(null); resolve?.(choice); }, []);
  useEffect(() => { setLabel(null); return () => { pending.current?.("cancel"); pending.current = null; }; }, [root]);
  const ask = useCallback((description: string): Promise<SaveChoice> => {
    if (pending.current) return Promise.resolve("cancel");
    setLabel(description); return new Promise(resolve => { pending.current = resolve; });
  }, []);
  const dialog = <Dialog open={label !== null} ariaLabel="Unsaved document changes" onOpenChange={open => { if (!open) finish("cancel"); }} className="fixed inset-0 z-50 m-0 flex h-dvh w-full items-center justify-center bg-black/50" panelClassName="max-w-md rounded border border-(--border-muted) bg-(--base) p-5 text-(--text)"><h2 className="font-semibold">Unsaved changes</h2><p className="my-4 text-sm">{label}</p><div className="flex gap-4 text-sm"><button onClick={() => finish("save")}>Save</button><button onClick={() => finish("discard")}>Don't Save</button><button autoFocus onClick={() => finish("cancel")}>Cancel</button></div></Dialog>;
  return { ask, dialog };
}
