import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Dialog from "./Dialog";
export type QuickPickItem = { id: string; label: string; description?: string; detail?: string; disabled?: string; icon?: ReactNode; content?: ReactNode; shortcut?: string };
type Props = { title: string; inputLabel: string; placeholder: string; query: string; onQuery: (query: string) => void; items: QuickPickItem[]; onChoose: (id: string) => void; onClose: () => void; loading?: boolean; empty?: string; dataTestId?: string; notice?: string | null; error?: string | null };
let pickerFocusOrigin: Element | null = null;

/** Domain-owned filtering; shared keyboard selection and focus lifecycle. */
export default function QuickPick({ title, inputLabel, placeholder, query, onQuery, items, onChoose, onClose, loading = false, empty = "No matches found", dataTestId, notice, error }: Props) {
  const [selected, setSelected] = useState(0);
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const previousSurface = useRef(document.activeElement);
  const composing = useRef(false);
  const active = Math.min(selected, Math.max(0, items.length - 1));
  useEffect(() => {
    const captured = previousSurface.current;
    const previous = captured?.closest('dialog[open]') ? pickerFocusOrigin : captured;
    if (previous && !previous.closest('dialog[open]')) pickerFocusOrigin = previous;
    input.current?.focus();
    return () => { queueMicrotask(() => {
      if (previous instanceof HTMLElement && previous.isConnected && document.activeElement === document.body && !document.querySelector('dialog[open]')) previous.focus();
    }); };
  }, []);
  useEffect(() => { document.getElementById(`${listId}-${active}`)?.scrollIntoView?.({ block: "nearest" }); }, [listId, active, items]);
  const choose = (index: number) => { const item = items[index]; if (item && !item.disabled) onChoose(item.id); };
  return <Dialog open onOpenChange={open => { if (!open && !composing.current) onClose(); }} ariaLabel={title} dataTestId={dataTestId}
    className="fixed inset-0 z-50 m-0 flex h-dvh w-full items-start justify-center bg-black/45 p-4 pt-[12vh]"
    panelClassName="w-full max-w-xl overflow-hidden border border-[var(--surface-glass-border)] bg-[var(--mantle)] shadow-xl">
    <input ref={input} role="combobox" aria-label={inputLabel} aria-expanded="true" aria-controls={listId} aria-autocomplete="list" aria-activedescendant={items.length ? `${listId}-${active}` : undefined}
      maxLength={256} autoComplete="off" spellCheck={false} value={query} placeholder={placeholder}
      onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
      onChange={event => { onQuery(event.target.value); setSelected(0); }}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing || composing.current || event.keyCode === 229) { if (event.key === "Escape") event.stopPropagation(); return; }
        const moves: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, PageDown: 10, PageUp: -10 };
        if (event.key in moves) { event.preventDefault(); setSelected(Math.max(0, Math.min(items.length - 1, active + moves[event.key]))); }
        else if ((event.key === "Home" || event.key === "End") && (event.ctrlKey || event.metaKey)) { event.preventDefault(); setSelected(event.key === "Home" ? 0 : Math.max(0, items.length - 1)); }
        else if (event.key === "Enter") { event.preventDefault(); choose(active); }
        else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
      }} className="h-11 w-full border-b border-[var(--border-structural)] bg-transparent px-3.5 text-[13px] text-[var(--text)] outline-none" />
    {error && <p role="alert" className="px-3 py-2 text-xs text-[var(--red)]">{error}</p>}
    {notice && <p role="status" className="px-3 py-2 text-xs text-[var(--yellow)]">{notice}</p>}
    <p role="status" aria-live="polite" className="sr-only">{loading ? "Loading" : `${items.length} results`}</p>
    <ul id={listId} role="listbox" aria-label={title} aria-busy={loading} className="max-h-80 overflow-y-auto p-1.5">
      {items.map((item, index) => <li key={item.id} id={`${listId}-${index}`} role="option" aria-selected={index === active} aria-disabled={Boolean(item.disabled)}>
        <button type="button" aria-label={item.label} disabled={Boolean(item.disabled)} title={item.disabled} onMouseMove={() => setSelected(index)} onClick={() => choose(index)}
          className={`flex w-full items-center gap-3 px-3 py-2 text-left text-xs disabled:opacity-50 ${index === active ? "bg-[var(--selection-bg)]" : "hover:bg-[var(--bg-hover)]"}`}>
          {item.icon}<span className="min-w-0 flex-1"><span className="block truncate">{item.content ?? item.label}</span>
            {(item.disabled || item.description) && <span className="block truncate text-[10px] text-[var(--overlay1)]">{item.disabled ?? item.description}</span>}
            {item.detail && <span className="block truncate text-[10px] text-[var(--subtext0)]">{item.detail}</span>}</span>
          {item.shortcut && <kbd className="shrink-0 font-mono text-[10px] text-[var(--overlay1)]">{item.shortcut}</kbd>}
        </button>
      </li>)}
    </ul>
    {!items.length && <p role="status" className="p-4 text-center text-xs text-[var(--overlay1)]">{loading ? "Loading…" : empty}</p>}
  </Dialog>;
}
