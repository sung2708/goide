import Dialog from "../../components/primitives/Dialog";
import { useRef, useState } from "react";
import type { GitTransaction } from "../git/useSourceControl";
import GoModuleActions from "./GoModuleActions";
import { useGoProjectInfo } from "./useGoProjectInfo";
type Props = { open: boolean; onClose: () => void; root: string | null; activePath: string | null; transaction?: GitTransaction; onChanged?: (root: string) => void; cancelPreparation?: () => void };
export default function GoProjectDialog({ open, onClose, root, activePath, transaction, onChanged, cancelPreparation }: Props) {
  const busyRef = useRef(false), [moduleBusy, setModuleBusy] = useState(false);
  const onBusy = (busy: boolean) => { busyRef.current = busy; setModuleBusy(busy); };
  const path = activePath?.replace(/\\/g, "/");
  const directory = path?.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ".";
  const { info, error, checking, refresh, cancel } = useGoProjectInfo(open, root, directory);
  return <Dialog open={open} onOpenChange={next => { if (!next && !busyRef.current) onClose(); }} ariaLabel="Go Project" panelClassName="w-[min(48rem,95vw)] max-h-[85vh] overflow-auto rounded-none border border-(--border) bg-(--base) p-5 text-(--text)">
    <h2>Go Project</h2>
    <p className="my-2 text-sm">Inspect the saved module/workspace selected by Go for the active file directory. Refresh after changing go.mod or go.work.</p>
    {!root && <p>Open a workspace first.</p>}
    {checking && <p role="status">Inspecting Go project…</p>}
    {error && <p role="alert" className="text-(--red)">{error}</p>}
    {info && <>
      <p className="my-2 break-all">{info.mode === "workspace" ? "Go workspace" : info.mode === "module" ? "Single module" : "Non-module Go directory"} · {info.directory}</p>
      {info.workFile && <p className="break-all">go.work: {info.workFile}</p>}
      {info.workError && <p role="alert">{info.workError}</p>}
      <ul>{info.modules.map(module => <li key={module.directory} className="my-3 border border-(--border) p-3 text-sm">
        <p>{module.modulePath ?? "Module information unavailable"}{module.goVersion ? ` · Go ${module.goVersion}` : ""}</p>
        <p className="break-all">{module.modFile}</p>
        {!module.insideWorkspace && <p>Outside opened workspace</p>}
        {module.error && <p role="alert" className="text-(--red)">{module.error}</p>}
      </li>)}</ul>
      {info.limited && <p role="status">Showing the first 128 workspace modules.</p>}
      <details className="my-3"><summary>Go environment</summary><dl>{Object.entries(info.environment).map(([key, value]) => <div className="my-2" key={key}><dt>{key}</dt><dd className="break-all text-sm">{value || "Not set"}</dd></div>)}</dl></details>
    </>}
    <GoModuleActions root={root} info={info} directory={directory} transaction={transaction} cancelPreparation={cancelPreparation} onBusy={onBusy} onChanged={owner => { onChanged?.(owner); void refresh(); }} />
    <div className="mt-4 flex justify-end gap-4">{checking && <button onClick={cancel}>Cancel inspection</button>}<button disabled={checking || moduleBusy || !root} onClick={() => void refresh()}>Refresh project</button><button disabled={moduleBusy} onClick={onClose}>Close</button></div>
  </Dialog>;
}
