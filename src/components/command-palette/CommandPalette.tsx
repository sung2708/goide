import { useMemo, useState } from "react";
import Dialog from "../primitives/Dialog";
import type { Command } from "../../features/commands/registry";
type Props = { commands: Command[]; execute: (id: string) => Promise<void>; onClose: () => void };
export default function CommandPalette({ commands, execute, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const filtered = useMemo(() => commands.filter(command => `${command.title} ${command.id}`.toLowerCase().includes(query.trim().toLowerCase())), [commands, query]);
  const choose = (command: Command) => { if (command.disabled) return; onClose(); void execute(command.id); };
  return <Dialog open={true} onOpenChange={open => { if (!open) onClose(); }} ariaLabel="Command palette" dataTestId="command-palette" className="fixed inset-0 z-50 m-0 flex h-dvh w-full items-start justify-center bg-black/40 pt-20" panelClassName="w-full max-w-xl overflow-hidden rounded border border-(--border-muted) bg-(--mantle)">
    <input autoFocus aria-label="Search commands" placeholder="Search commands…" value={query} onChange={event => { setQuery(event.target.value); setSelected(0); }} onKeyDown={event => {
      if (event.key === "ArrowDown") { event.preventDefault(); setSelected(index => Math.min(index + 1, filtered.length - 1)); }
      if (event.key === "ArrowUp") { event.preventDefault(); setSelected(index => Math.max(0, index - 1)); }
      if (event.key === "Enter") { event.preventDefault(); const command = filtered[selected]; if (command) choose(command); }
    }} className="w-full border-b border-(--border-muted) bg-(--crust) px-4 py-3 text-sm text-(--text)" />
    <div className="max-h-96 overflow-auto p-2">{filtered.length === 0 && <p role="status" className="p-2 text-sm">No matching commands.</p>}{filtered.map((command, index) => <button key={command.id} type="button" disabled={Boolean(command.disabled)} title={command.disabled} onClick={() => choose(command)} className={`flex w-full flex-wrap items-center justify-between gap-2 rounded px-3 py-2 text-left text-sm disabled:opacity-50 ${index === selected ? "bg-(--selection-bg)" : "hover:bg-(--bg-hover)"}`}><span>{command.title}{command.disabled && <small className="block text-(--overlay1)">{command.disabled}</small>}</span><kbd className="text-xs text-(--overlay1)">{command.shortcut?.replace("Mod", navigator.platform.startsWith("Mac") ? "Cmd" : "Ctrl")}</kbd></button>)}</div>
  </Dialog>;
}
