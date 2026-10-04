import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import Dialog from "../primitives/Dialog";
type Params = { dirty: () => boolean; busy: () => boolean; save: () => Promise<boolean>; discard?: () => void; cancelAutosave: () => void; onError: (message: string) => void; onPending?: (pending: boolean) => void; registerInstall?: (handler: () => void) => () => void; install?: () => Promise<void> };
export function useSafeWindowClose(params: Params) {
  const latest = useRef(params); latest.current = params;
  const [pending, setPending] = useState(false);
  const [closing, setClosing] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const allowed = useRef(false);
  const action = useRef<"close" | "update">("close");
  const operation = useRef(false);
  const discardOnClose = useRef(false);
  const discarded = useRef(false);
  const [cleaned, setCleaned] = useState(false);
  const [shutdownStarted, setShutdownStarted] = useState(false);
  const [updating, setUpdating] = useState(false);
  useEffect(() => latest.current.registerInstall?.(() => {
    if (operation.current || pending) return;
    action.current = "update"; setUpdating(true); latest.current.cancelAutosave(); latest.current.onPending?.(true); setPending(true);
  }), [pending]);
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
    const requestClose = () => { if (!allowed.current) { latest.current.cancelAutosave(); latest.current.onPending?.(true); setPending(true); } };
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
    if (operation.current || latest.current.busy()) { const message = "Wait for the current document or Git operation before closing."; setFailure(message); latest.current.onError(message); return; }
    operation.current = true;
    setClosing(true);
    setFailure(null);
    try {
      if (!shutdownStarted && save && !(await latest.current.save())) { setFailure("Saving did not complete. Your drafts remain open. Resolve the save errors and retry."); return; }
      if (!shutdownStarted) discardOnClose.current = !save && action.current === "close";
      setShutdownStarted(true);
      const response = await invoke<{ ok: boolean; error?: { message: string } }>("shutdown_owned_resources");
      if (!response.ok) throw new Error(response.error?.message ?? "Unable to stop workspace processes.");
      setCleaned(true);
      if (action.current === "update" && latest.current.install) { await latest.current.install(); return; }
      if (discardOnClose.current && !discarded.current) {
        latest.current.discard?.();
        discarded.current = true;
      }
      allowed.current = true;
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().destroy();
    } catch (error) { allowed.current = false; const message = error instanceof Error ? error.message : "Unable to update or close safely. Retry after checking the update and cleanup status."; setFailure(message); latest.current.onError(message); }
    finally { operation.current = false; setClosing(false); }
  };
  const cancel = () => { if (shutdownStarted || operation.current) return; action.current = "close"; setUpdating(false); setPending(false); };
  const dialog = <Dialog open={pending} ariaLabel="Close Goro safely" closeOnBackdrop={false} onOpenChange={(open) => { if (!open) cancel(); }} className="fixed inset-0 z-50 m-0 flex h-dvh w-full items-center justify-center bg-black/50" panelClassName="max-w-md rounded border border-(--border-muted) bg-(--base) p-5 text-(--text)">
    <h2>{updating ? "Install update and restart Goro?" : "Close Goro?"}</h2>
    <p className="my-3 text-sm">{cleaned ? "Workspace processes have stopped. Retry the update or close and reopen Goro." : shutdownStarted ? "Workspace cleanup did not finish. Retry before updating or closing." : latest.current.dirty() ? "Save your editor and retained conflict-result changes before continuing?" : "Goro will stop runs, tests, debug sessions, Git, terminals and language services before continuing."}</p>
    {failure && <p role="alert" className="my-3 text-sm text-(--red)">{failure}</p>}
    {!updating && !shutdownStarted && latest.current.dirty() && <p className="my-3 text-sm">Don't Save removes this workspace's editor edits and stored recovery drafts. Goro will open Welcome next time; other workspaces' drafts remain.</p>}
    <div className="flex flex-wrap gap-4 text-sm">
      <button disabled={closing} onClick={() => void finish(true)}>{updating ? cleaned ? "Retry installation" : shutdownStarted ? "Retry cleanup and install" : "Save and install" : shutdownStarted ? "Retry cleanup and close" : "Save and close"}</button>
      {!shutdownStarted && latest.current.dirty() && <button disabled={closing} onClick={() => void finish(false)}>{updating ? "Discard editor edits and install" : "Don't Save and close"}</button>}
      {shutdownStarted && updating && <button disabled={closing} onClick={() => { action.current = "close"; void finish(false); }}>Close Goro</button>}
      <button disabled={closing || shutdownStarted} autoFocus onClick={cancel}>Cancel</button>
    </div>
  </Dialog>;
  return dialog;
}
