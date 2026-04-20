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
      className="fixed inset-0 z-50 m-0 flex h-dvh w-full items-center justify-center bg-[rgba(35,38,52,0.7)] p-4"
      panelClassName="w-[min(92vw,380px)] rounded-lg border border-[var(--border-muted)] bg-[var(--mantle)] p-0 text-[var(--text)] shadow-[var(--panel-shadow)]"
    >
      <div className="border-b border-[var(--border-subtle)] px-5 py-4">
        <p className="text-[14px] font-semibold">{title}</p>
        <p className="mt-1.5 text-[13px] text-[var(--subtext0)]">
          {description}
        </p>
      </div>
      <div className="flex justify-end gap-2 px-5 py-3.5">
        <button
          type="button"
          className="rounded border border-[var(--surface1)] px-3.5 py-1.5 text-[12px] font-medium text-[var(--subtext1)] transition-colors duration-100 hover:bg-[var(--bg-hover)]"
          onClick={() => onOpenChange(false)}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          className="rounded bg-[var(--red)] px-3.5 py-1.5 text-[12px] font-semibold text-[var(--crust)] transition-opacity duration-100 hover:opacity-90"
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
