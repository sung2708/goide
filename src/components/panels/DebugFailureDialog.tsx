import { useEffect, useRef } from "react";

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
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousActive = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const dialog = dialogRef.current;
      if (!dialog) {
        return;
      }

      const focusable = dialog.querySelectorAll<HTMLElement>(
        'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey) {
        if (!active || active === first || !dialog.contains(active)) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousActive?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="rounded-lg border border-[var(--border-muted)] bg-[var(--mantle)] p-4 shadow-[var(--panel-shadow)]"
        onClick={(event) => event.stopPropagation()}
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
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="rounded border border-[var(--border-subtle)] px-3 py-1 text-sm text-[var(--subtext1)] hover:bg-[var(--bg-hover)]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
