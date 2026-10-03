import { useMemo, useState } from "react";
import Dialog from "../primitives/Dialog";
import type { Command } from "../../features/commands/registry";

type Props = {
  commands: Command[];
  execute: (id: string) => Promise<void>;
  onClose: () => void;
};

export default function CommandPalette({ commands, execute, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);

  const filtered = useMemo(
    () =>
      commands.filter((command) =>
        `${command.title} ${command.id}`.toLowerCase().includes(query.trim().toLowerCase())
      ),
    [commands, query]
  );

  const choose = (command: Command) => {
    if (command.disabled) return;
    onClose();
    void execute(command.id);
  };

  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      ariaLabel="Command palette"
      dataTestId="command-palette"
      className="fixed inset-0 z-50 m-0 flex h-dvh w-full items-center justify-center bg-black/45 backdrop-blur-[8px] p-4"
      panelClassName="w-full max-w-xl overflow-hidden rounded-none border border-[var(--surface-glass-border)] bg-[var(--surface-glass)] shadow-[0_20px_40px_-15px_rgba(0,0,0,0.7),inset_0_1px_0_0_rgba(255,255,255,0.08)] backdrop-blur-[var(--blur-elevated)]"
    >
      <div className="relative flex items-center border-b border-[var(--border-structural)] px-3.5">
        <svg
          aria-hidden="true"
          className="size-4 shrink-0 text-[var(--overlay1)] mr-2.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          autoFocus
          aria-label="Search commands"
          placeholder="Type a command or search…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelected(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setSelected((index) => Math.min(index + 1, Math.max(0, filtered.length - 1)));
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setSelected((index) => Math.max(0, index - 1));
            }
            if (event.key === "Enter") {
              event.preventDefault();
              const command = filtered[selected];
              if (command) choose(command);
            }
          }}
          className="h-11 w-full bg-transparent text-[13px] text-[var(--text)] placeholder-[var(--overlay1)] outline-none"
        />
      </div>
      <div className="max-h-80 overflow-y-auto p-1.5 scrollbar-thin">
        {filtered.length === 0 && (
          <p role="status" className="py-6 text-center text-xs text-[var(--overlay1)]">
            No matching commands.
          </p>
        )}
        {filtered.map((command, index) => {
          const isSelected = index === selected;
          return (
            <button
              key={command.id}
              type="button"
              disabled={Boolean(command.disabled)}
              title={command.disabled}
              onClick={() => choose(command)}
              className={`group relative flex w-full items-center justify-between gap-3 rounded-none px-3 py-2 text-left text-[12px] transition-colors duration-75 disabled:opacity-40 ${
                isSelected
                  ? "bg-[var(--selection-bg)] text-[var(--text)]"
                  : "text-[var(--subtext1)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
              }`}
            >
              <div className="min-w-0 flex-1">
                <span className="block truncate font-medium">{command.title}</span>
                {command.disabled && (
                  <span className="block text-[10px] text-[var(--overlay1)] truncate">
                    {command.disabled}
                  </span>
                )}
              </div>
              {command.shortcut && (
                <kbd className="shrink-0 rounded-none bg-[var(--surface0)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--overlay1)] border border-[var(--border-subtle)]">
                  {command.shortcut.replace("Mod", navigator.platform.startsWith("Mac") ? "Cmd" : "Ctrl")}
                </kbd>
              )}
            </button>
          );
        })}
      </div>
    </Dialog>
  );
}
