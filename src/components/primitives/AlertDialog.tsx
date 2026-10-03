import Dialog from "./Dialog";

type AlertDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
};

function AlertDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
}: AlertDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      role="alertdialog"
      ariaLabel={title}
      className="fixed inset-0 z-50 m-0 flex h-dvh w-full items-center justify-center bg-black/45 backdrop-blur-[6px] p-4"
      panelClassName="w-[min(92vw,400px)] overflow-hidden rounded-none border border-[var(--surface-glass-border)] bg-[var(--surface-glass)] p-0 text-[var(--text)] shadow-[0_20px_40px_-15px_rgba(0,0,0,0.7),inset_0_1px_0_0_rgba(255,255,255,0.08)] backdrop-blur-[var(--blur-elevated)]"
    >
      <div className="border-b border-[var(--border-structural)] px-5 py-4">
        <p className="text-[13px] font-semibold text-[var(--text)]">{title}</p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--subtext0)]">
          {description}
        </p>
      </div>
      <div className="flex justify-end gap-2 bg-[var(--surface0)]/30 px-5 py-3">
        <button
          type="button"
          className="rounded-none border border-[var(--border-default)] px-3 py-1.5 text-[12px] font-medium text-[var(--subtext1)] transition-colors duration-100 hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
          onClick={() => onOpenChange(false)}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          className="rounded-none bg-[var(--red)] px-3.5 py-1.5 text-[12px] font-semibold text-[var(--crust)] shadow-sm transition-opacity duration-100 hover:opacity-90"
          onClick={() => {
            onConfirm();
            onOpenChange(false);
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}

export default AlertDialog;
