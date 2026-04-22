type DebugFailureDialogProps = {
  open: boolean;
  title: string;
  message: string;
  details: string | null;
  onClose: () => void;
};

export default function DebugFailureDialog({
  open,
  title,
  message,
  details,
  onClose,
}: DebugFailureDialogProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label={title}
      className="rounded-lg border border-[var(--border-muted)] bg-[var(--mantle)] p-4 shadow-[var(--panel-shadow)]"
    >
      <h3 className="text-sm font-semibold text-[var(--text)]">{title}</h3>
      <p className="mt-2 text-sm text-[var(--subtext0)]">{message}</p>
      {details && (
        <pre className="mt-3 overflow-auto rounded-md bg-[var(--crust)] p-3 text-xs text-[var(--subtext1)]">
          {details}
        </pre>
      )}
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-[var(--border-subtle)] px-3 py-1 text-sm text-[var(--subtext1)] hover:bg-[var(--bg-hover)]"
        >
          Close
        </button>
      </div>
    </div>
  );
}
