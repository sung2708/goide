import ManagedToolchainPanel from "./ManagedToolchainPanel";
import Dialog from "../../components/primitives/Dialog";
import type { ToolchainStatus } from "../../lib/ipc/types";

type Props = { open: boolean; onClose: () => void; status: ToolchainStatus | null; error: string | null; checking: boolean; refresh: () => Promise<void> };
export default function ToolchainDialog({ open, onClose, status, error, checking, refresh }: Props) {
  return <Dialog open={open} onOpenChange={next => { if (!next) onClose(); }} ariaLabel="Go Toolchain" panelClassName="w-[min(44rem,95vw)] max-h-[85vh] overflow-auto rounded border border-(--border) bg-(--base) p-5 text-(--text)">
    <h2>Go Toolchain</h2>
    <p className="my-2 text-sm">Version commands inspect installed tools. A successful probe does not certify project or debugger compatibility.</p>
    {checking && <p role="status">Checking native tools…</p>}
    {error && <p role="alert" className="text-(--red)">{error}</p>}
    {status && <dl>{([["Go", status.go], ["gopls", status.gopls], ["Delve", status.delve]] as const).map(([name, tool]) => <div key={name} className="my-3 border border-(--border) p-3">
      <dt>{name} · {tool.status ?? "unknown"}</dt>
      <dd className="break-all text-sm">{tool.path ?? "Executable path unavailable"}</dd>
      <dd className="whitespace-pre-wrap break-words text-sm">{tool.version ?? "No verified version"}</dd>
      {tool.error && <dd className="break-words text-(--red)">{tool.error}</dd>}
    </div>)}</dl>}
    {open && <ManagedToolchainPanel />}
    <div className="mt-4 flex justify-end gap-4"><button disabled={checking} onClick={() => void refresh()}>Refresh toolchain</button><button onClick={onClose}>Close</button></div>
  </Dialog>;
}
