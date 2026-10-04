import { useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import Dialog from "../../components/primitives/Dialog";
import { createGoProject } from "../../lib/ipc/client";
import type { ToolPaths } from "../../lib/ipc/types";
import { configureInOrder } from "../settings/toolchainConfiguration";

type Props = { paths: ToolPaths; onClose: () => void; onCreated: (path: string) => Promise<boolean> };
export default function NewGoProjectDialog({ paths, onClose, onCreated }: Props) {
  const [parent, setParent] = useState("");
  const [name, setName] = useState("");
  const [modulePath, setModulePath] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const chooseParent = async () => {
    if (busyRef.current) return;
    try {
      const selected = await open({ directory: true, multiple: false, title: "Choose parent folder for new Go project" });
      if (typeof selected === "string") setParent(selected);
    } catch (failure) { setError(String(failure)); }
  };
  const submit = async () => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(null);
    try {
      let target = created;
      if (!target) {
        const configured = await configureInOrder(paths, () => true);
        if (!configured?.ok) throw new Error(configured?.error?.message ?? "Check executable paths in Settings.");
        const response = await createGoProject({ parentDirectory: parent, name: name.trim(), modulePath: modulePath.trim() });
        if (!response.ok || !response.data) throw new Error(response.error?.message ?? "Unable to create project.");
        target = response.data; setCreated(target);
      }
      if (await onCreated(target)) onClose();
      else setError(`Project created at ${target}. Opening was cancelled or blocked; you can open it later with Open Folder.`);
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { busyRef.current = false; setBusy(false); }
  };
  return <Dialog open onOpenChange={next => { if (!next && !busyRef.current) onClose(); }} ariaLabel="New Go Project" panelClassName="w-[min(34rem,95vw)] rounded-none border border-(--border) bg-(--base) p-5 text-(--text)">
    <h2>New Go Project</h2>
    <p className="my-3 text-sm">Create a new folder with go.mod and a runnable main.go using your installed Go toolchain. Go creates go.sum when dependencies need checksums.</p>
    <form onSubmit={event => { event.preventDefault(); void submit(); }}>
      <fieldset disabled={busy || !!created} className="flex flex-col gap-3">
        <label>Parent folder <div className="flex gap-2"><input aria-label="Parent folder" className="min-w-0 flex-1 border border-(--border) p-2" value={parent} readOnly required /><button type="button" onClick={() => void chooseParent()}>Browse…</button></div></label>
        <label>Project name <input className="block w-full border border-(--border) p-2" value={name} onChange={event => setName(event.target.value)} placeholder="hello-go" required maxLength={128} pattern="[A-Za-z0-9_-][A-Za-z0-9_.-]*" /></label>
        <label>Module path <input className="block w-full border border-(--border) p-2" value={modulePath} onChange={event => setModulePath(event.target.value)} placeholder="example.com/hello-go" required maxLength={512} /></label>
      </fieldset>
      {created && <p className="my-3 break-all">Created: {created}</p>}
      {error && <p role="alert" className="my-3 text-(--red)">{error}</p>}
      {busy && <p role="status" className="my-3">Creating and opening project…</p>}
      <div className="mt-5 flex justify-end gap-4"><button type="button" disabled={busy} onClick={onClose}>Close</button><button type="submit" disabled={busy || (!created && (!parent || !name.trim() || !modulePath.trim()))}>{created ? "Open Project" : "Create Project"}</button></div>
    </form>
  </Dialog>;
}
