import type { DocumentSnapshot } from "./DocumentSession";
import { isDocumentDirty } from "./DocumentSession";
import { cn } from "../../lib/utils/cn";

type Props = {
  snapshot: DocumentSnapshot;
  busy: boolean;
  activate: (path: string) => void;
  close: (id: number) => void;
};

function getFileIcon(filename: string) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".go")) {
    return (
      <svg className="size-3.5 shrink-0 text-[#00ADD8]" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l6 4.5-6 4.5z" />
      </svg>
    );
  }
  if (lower.startsWith("go.mod") || lower.startsWith("go.sum") || lower.startsWith("go.work")) {
    return (
      <svg className="size-3.5 shrink-0 text-[#F59E0B]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m7.5 4.27 9 5.15" />
        <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
        <path d="m3.3 7 8.7 5 8.7-5" />
        <path d="M12 22V12" />
      </svg>
    );
  }
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) {
    return (
      <svg className="size-3.5 shrink-0 text-[#3B82F6]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4h16v16H4z" />
        <path d="M7 15V9l3 3 3-3v6" />
        <path d="M17 12l-2 3h4l-2-3v-3" />
      </svg>
    );
  }
  if (lower.endsWith(".json") || lower.endsWith(".yaml") || lower.endsWith(".yml") || lower.endsWith(".toml")) {
    return (
      <svg className="size-3.5 shrink-0 text-[#10B981]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1" />
        <path d="M16 21h1a2 2 0 0 0 2-2v-5a2 2 0 0 1 2-2 2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1" />
      </svg>
    );
  }
  return (
    <svg className="size-3.5 shrink-0 text-[var(--overlay1)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

export default function DocumentTabs({ snapshot, busy, activate, close }: Props) {
  return (
    <div
      role="tablist"
      aria-label="Open documents"
      onKeyDown={(event) => {
        if (busy || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        const index = snapshot.documents.findIndex((document) => document.id === snapshot.activeId);
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
            ? snapshot.documents.length - 1
            : (index + (event.key === "ArrowRight" ? 1 : -1) + snapshot.documents.length) %
              snapshot.documents.length;
        const document = snapshot.documents[next];
        if (!document) return;
        event.preventDefault();
        activate(document.path);
        (
          event.currentTarget.querySelectorAll('[role="tab"]')[next] as HTMLElement | undefined
        )?.focus();
      }}
      className="flex h-9 shrink-0 items-stretch overflow-x-auto border-b border-[var(--border-structural)] bg-[var(--surface-chrome)] select-none"
    >
      {snapshot.documents.map((document) => {
        const isActive = snapshot.activeId === document.id;
        const isDirty = isDocumentDirty(document);
        const filename = document.path.split("/").pop() ?? document.path;
        return (
          <div
            key={document.id}
            className={cn(
              "group relative flex shrink-0 items-center gap-1.5 border-r border-[var(--border-structural)] px-2.5 text-[12px] transition-all duration-100",
              isActive
                ? "bg-[var(--surface-solid)] text-[var(--text)] font-medium"
                : "text-[var(--subtext0)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
            )}
          >
            {isActive && (
              <div className="absolute top-0 inset-x-0 h-[2px] bg-[var(--brand-primary)]" />
            )}
            <button
              type="button"
              role="tab"
              tabIndex={isActive ? 0 : -1}
              aria-selected={isActive}
              title={document.path}
              disabled={busy}
              onClick={() => activate(document.path)}
              className="flex items-center gap-1.5 max-w-60 truncate py-1.5 text-left outline-none"
            >
              {getFileIcon(filename)}
              <span className="truncate">{filename}</span>
              {isDirty && (
                <span className="size-1.5 rounded-full bg-[var(--brand-primary)] shrink-0" title="Unsaved changes" />
              )}
              {document.readOnly && (
                <span className="ml-0.5 text-[10px] text-[var(--overlay1)]">(read only)</span>
              )}
            </button>
            <button
              type="button"
              aria-label={`Close ${document.path}`}
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation();
                close(document.id);
              }}
              className="flex size-4.5 items-center justify-center rounded text-[12px] text-[var(--overlay1)] hover:bg-[var(--surface1)] hover:text-[var(--text)] transition-colors opacity-60 group-hover:opacity-100"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
