type DebugFailureDialogProps = {
  open: boolean;
  title: string;
  message: string;
  details: string | null;
  onClose: () => void;
};

function DebugFailureDialog({ open, title, message, details, onClose }: DebugFailureDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/40"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-[420px] max-w-[90vw] rounded-lg border border-[rgba(231,130,132,0.35)] bg-[var(--mantle)] shadow-xl"
      >
        <header className="flex items-center justify-between border-b border-[rgba(231,130,132,0.2)] px-5 py-3">
          <h2 className="text-[13px] font-semibold text-[var(--red)]">{title}</h2>
          <button
            type="button"
            aria-label="Close dialog"
            className="rounded p-1 text-[var(--overlay1)] hover:text-[var(--text)]"
            onClick={onClose}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        <div className="px-5 py-4 space-y-3">
          <p className="text-[12px] text-[var(--text)] leading-relaxed">{message}</p>

          {details && (
            <details className="group">
              <summary className="cursor-pointer text-[11px] text-[var(--overlay1)] select-none">
                Details
              </summary>
              <pre className="mt-2 overflow-x-auto rounded border border-[var(--border-subtle)] bg-[var(--crust)] px-3 py-2 text-[11px] text-[var(--subtext0)] font-mono whitespace-pre-wrap">
                {details}
              </pre>
            </details>
          )}
        </div>

        <footer className="flex justify-end border-t border-[rgba(113,125,144,0.2)] px-5 py-3">
          <button
            type="button"
            className="rounded border border-[rgba(113,125,144,0.3)] bg-[rgba(42,48,61,0.4)] px-4 py-1.5 text-[11px] font-semibold text-[var(--subtext1)] hover:bg-[rgba(126,162,220,0.12)]"
            onClick={onClose}
          >
            Dismiss
          </button>
        </footer>
      </div>
    </div>
  );
}

export default DebugFailureDialog;
