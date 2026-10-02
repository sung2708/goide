import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import Dialog from "../primitives/Dialog";
type Params = { dirty: () => boolean; busy: () => boolean; save: () => Promise<boolean>; cancelAutosave: () => void; onError: (message: string) => void; onPending?: (pending: boolean) => void };
export function useSafeWindowClose(params: Params) {
  const latest = useRef(params); latest.current = params;
  const [pending, setPending] = useState(false);
  const [closing, setClosing] = useState(false);
  const allowed = useRef(false);
  useEffect(() => { latest.current.onPending?.(pending); }, [pending]);
  useEffect(() => {
    const native = Boolean((globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
    if (!native) {
      const beforeUnload = (event: BeforeUnloadEvent) => {
        if (latest.current.dirty() || latest.current.busy()) { event.preventDefault(); event.returnValue = ""; }
      };
      window.addEventListener("beforeunload", beforeUnload);
      return () => window.removeEventListener("beforeunload", beforeUnload);
    }
    let disposed = false;
    let unlisten: (() => void) | undefined;
    let quitUnlisten: (() => void) | undefined;
    const requestClose = () => { if (!allowed.current) { latest.current.cancelAutosave(); setPending(true); } };
    void import("@tauri-apps/api/event").then(async ({ listen }) => {
      const stop = await listen("app-close-requested", requestClose);
      if (disposed) stop(); else quitUnlisten = stop;
    }).catch((error) => latest.current.onError(`Unable to install safe app quit: ${String(error)}`));
    void import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
      const stop = await getCurrentWindow().onCloseRequested((event) => {
        if (allowed.current) return;
        event.preventDefault(); requestClose();
      });
      if (disposed) stop(); else unlisten = stop;
    }).catch((error) => latest.current.onError(`Unable to install safe window close: ${String(error)}`));
    return () => { disposed = true; unlisten?.(); quitUnlisten?.(); };
  }, []);
  const finish = async (save: boolean) => {
    if (closing || latest.current.busy()) { latest.current.onError("Wait for the current document operation before closing."); return; }
    setClosing(true);
    try {
      if (save && !(await latest.current.save())) return;
      const response = await invoke<{ ok: boolean; error?: { message: string } }>("shutdown_owned_resources");
      if (!response.ok) throw new Error(response.error?.message ?? "Unable to stop workspace processes.");
      allowed.current = true;
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().destroy();
    } catch (error) { allowed.current = false; latest.current.onError(error instanceof Error ? error.message : "Unable to close safely."); }
    finally { setClosing(false); }
  };
  const dialog = <Dialog open={pending} ariaLabel="Close GoIDE safely" closeOnBackdrop={false} onOpenChange={(open) => { if (!open && !closing) setPending(false); }} className="fixed inset-0 z-50 m-0 flex h-dvh w-full items-center justify-center bg-black/50" panelClassName="max-w-md rounded border border-(--border-muted) bg-(--base) p-5 text-(--text)"><h2>Close GoIDE?</h2><p className="my-3 text-sm">{latest.current.dirty() ? "Save your editor and retained conflict-result changes before closing?" : "GoIDE will stop its workspace processes before closing."}</p><div className="flex gap-4 text-sm"><button disabled={closing} onClick={() => void finish(true)}>Save and close</button>{latest.current.dirty() && <button disabled={closing} onClick={() => void finish(false)}>Discard editor edits and close</button>}<button disabled={closing} autoFocus onClick={() => setPending(false)}>Cancel</button></div></Dialog>;
  return dialog;
}
