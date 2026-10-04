import { useEffect, useRef, useState } from "react";
import { managedTools, type ManagedState } from "./managedTools";
import { useSettings } from "./useSettings";
const runningPhases = new Set(["downloading", "extracting", "installing-gopls", "installing-delve", "verifying", "cancelling"]);
const labels: Record<string, string> = { downloading: "Downloading Go", extracting: "Extracting Go", "installing-gopls": "Installing gopls", "installing-delve": "Installing Delve", verifying: "Checking installed versions", cancelling: "Stopping setup and cleaning up", complete: "Installed — select Use this bundle to activate", cancelled: "Setup cancelled", failed: "Setup failed" };
export default function ManagedToolchainPanel() {
  const settings = useSettings();
  const [state, setState] = useState<ManagedState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { const next = await managedTools.state(); if (mounted.current) setState(next); }
      catch (failure) { if (mounted.current) setError(String(failure instanceof Error ? failure.message : failure)); }
      if (mounted.current) timer = setTimeout(() => void poll(), 1000);
    };
    void poll();
    return () => { mounted.current = false; clearTimeout(timer); };
  }, []);
  const running = runningPhases.has(state?.progress.phase ?? "");
  const action = async (work: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await work(); const next = await managedTools.state(); if (mounted.current) setState(next); }
    catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { if (mounted.current) setBusy(false); }
  };
  return <section aria-label="Managed tools" className="mt-5 border-t border-(--border) pt-4">
    <h3>Set up tools with Goro</h3>
    <p className="my-2 text-sm text-(--subtext0)">Tools are installed in Goro’s private data folder. Your system Go and existing project files stay untouched. Installing does not select the new tools.</p>
    {state?.catalog && <p className="my-2 text-sm">Go {state.catalog.goVersion} · gopls {state.catalog.goplsVersion} · Delve {state.catalog.delveVersion}<br />Go archive: {(state.catalog.archiveBytes / 1024 / 1024).toFixed(1)} MiB. Building the tools requires additional downloads and disk space.</p>}
    {state?.catalog && <p className="text-sm text-(--subtext0)">Sources: go.dev, proxy.golang.org and sum.golang.org. This pinned bundle still needs platform acceptance testing.</p>}
    {(error || state?.catalogError || state?.progress.error) && <p className="my-2 break-words text-sm text-(--red)">{error ?? state?.catalogError ?? state?.progress.error}</p>}
    {state && state.progress.phase !== "idle" && <p role="status" className="my-2 text-sm">{labels[state.progress.phase] ?? state.progress.phase}{state.progress.phase === "downloading" ? ` · ${(state.progress.downloadedBytes / 1024 / 1024).toFixed(1)} MiB` : ""}</p>}
    <div className="my-3 flex flex-wrap gap-4">
      <button disabled={busy || running || !state?.catalog} onClick={() => void action(() => managedTools.start())}>Download and install tools</button>
      {running && <button disabled={busy || state?.progress.phase === "cancelling"} onClick={() => void action(() => managedTools.cancel(state!.progress.requestId!))}>Cancel setup</button>}
    </div>
    {state?.installed.map(bundle => {
      const selected = settings.values["go.executablePath"] === bundle.paths.go && settings.values["go.goplsPath"] === bundle.paths.gopls && settings.values["debug.delvePath"] === bundle.paths.dlv;
      return <div key={bundle.id} className="my-3 border border-(--border) p-3 text-sm">
        <p>Go {bundle.catalog.goVersion} · gopls {bundle.catalog.goplsVersion} · Delve {bundle.catalog.delveVersion}{selected ? " · Selected" : ""}</p>
        <p className="my-2 break-all text-(--subtext0)">{bundle.paths.go}</p>
        <div className="flex gap-4">
          <button disabled={busy || running || selected} onClick={() => void action(async () => {
            if (settings.error?.includes("Stored settings are invalid")) throw new Error("Reset invalid stored preferences before selecting managed tools.");
            const paths = await managedTools.use(bundle.id);
            settings.store.updateToolPaths(paths);
            // useToolchainStatus observes the single settings transaction. Calling
            // its previous refresh closure here would restore the old paths.
          })}>Use this bundle</button>
          <button disabled={busy || running || selected} onClick={() => void action(() => managedTools.remove(bundle.id))}>Remove bundle</button>
        </div>
      </div>;
    })}
    {settings.error && <p className="text-sm text-(--red)">{settings.error}</p>}
    <p className="text-sm text-(--subtext0)">New terminal sessions receive the selected paths. Restart existing shells to use a different bundle. Custom paths remain available in Settings.</p>
  </section>;
}
