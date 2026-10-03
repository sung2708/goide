import { useEffect, useSyncExternalStore, useState } from "react";
import { updateService } from "./service";
import { useSettings } from "../settings/useSettings";
import { defaultChannel, type Channel } from "./UpdateService";
const label = { idle: "Ready to check", checking: "Checking for updates…", upToDate: "Up to date", updateAvailable: "Update available", downloading: "Downloading and verifying…", downloaded: "Verified update ready to install", installing: "Installing…", restartRequired: "Restart required", error: "Update unavailable" };
export function UpdatePanel() {
  const state = useSyncExternalStore(updateService.subscribe, updateService.snapshot);
  const { values } = useSettings();
  useEffect(() => { void updateService.initialize(); }, []);
  const channel = values["updates.channel"] === "default" ? undefined : values["updates.channel"] as Channel;
  const busy = ["checking", "downloading", "installing"].includes(state.phase);
  const selected = (channel ?? defaultChannel(state.currentVersion)) === state.channel;
  return <section aria-label="Goro updates" className="my-3 border border-(--border-default) p-3 text-xs">
    <h3 className="font-semibold">About Goro & Updates</h3>
    <p className="my-2">Version {state.currentVersion || "unavailable"} · selected {channel ?? defaultChannel(state.currentVersion)} channel</p>
    {!selected && state.release && <p>Channel changed. Check again before downloading or installing.</p>}
    <p role="status">{label[state.phase]}{state.release && ` · ${state.release.version}`}</p>
    {state.release?.publishedAt && <p>Published: {state.release.publishedAt}</p>}
    {state.phase === "downloaded" && <p>Verified download: {(state.received / 1048576).toFixed(1)} MiB</p>}
    {state.lastChecked && <p>Last checked: {new Date(state.lastChecked).toLocaleString()}</p>}
    {state.error && <p role={state.phase === "error" ? "alert" : undefined} className="my-2 text-(--red)">{state.error.message}</p>}
    {state.phase === "downloading" && <><progress aria-label="Update download" max={state.total || undefined} value={state.total ? Math.min(state.received, state.total) : undefined} /><p>{(state.received / 1048576).toFixed(1)} MiB received{state.total ? ` of ${(state.total / 1048576).toFixed(1)} MiB` : " · total unknown"}</p></>}
    {state.release?.notes && <details className="my-2"><summary>Release notes</summary><pre className="max-h-48 overflow-auto whitespace-pre-wrap font-sans">{state.release.notes}</pre></details>}
    <div className="mt-3 flex flex-wrap gap-4">
      <button disabled={busy} onClick={() => void updateService.check(channel)}>Check for Updates</button>
      {selected && state.release && ["updateAvailable", "error"].includes(state.phase) && <button onClick={() => void updateService.download()}>Download update</button>}
      {selected && state.phase === "downloaded" && <button onClick={updateService.requestInstall}>Install and Restart</button>}
      {["checking", "downloading"].includes(state.phase) && <button onClick={() => void updateService.cancel()}>Cancel update</button>}
    </div>
    <p className="mt-2 text-(--subtext0)">Installation requires confirmation and workspace cleanup.</p>
  </section>;
}
export function UpdateNotice() {
  const state = useSyncExternalStore(updateService.subscribe, updateService.snapshot);
  const { values } = useSettings();
  const [dismissed, dismiss] = useState("");
  const version = state.release?.version ?? "";
  const selectedChannel = values["updates.channel"] === "default" ? defaultChannel(state.currentVersion) : values["updates.channel"];
  if (dismissed === version || !["updateAvailable", "downloaded"].includes(state.phase) || selectedChannel !== state.channel) return null;
  return <div role="status" className="flex shrink-0 items-center gap-4 border-b border-(--border-default) bg-(--surface0) px-3 py-1 text-xs"><span>Goro {version} {state.phase === "downloaded" ? "is ready to install" : "is available"}</span><button onClick={state.phase === "downloaded" ? updateService.requestInstall : () => void updateService.download()}>{state.phase === "downloaded" ? "Install and Restart" : "Download update"}</button><button aria-label="Dismiss update notification" onClick={() => dismiss(version)}>Dismiss</button></div>;
}
