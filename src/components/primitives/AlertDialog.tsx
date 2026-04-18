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
      className="fixed inset-0 z-50 m-0 flex h-dvh w-full items-center justify-center bg-[rgba(8,11,16,0.7)] p-4"
      panelClassName="w-[min(92vw,360px)] rounded border border-[var(--surface0)] bg-[var(--mantle)] p-0 text-[var(--text)] shadow-lg"
    >
      <div className="border-b border-[var(--surface0)] px-4 py-3">
        <p className="text-[12px] font-semibold text-balance">{title}</p>
        <p className="mt-1 text-[11px] text-[var(--subtext0)] text-pretty">
          {description}
        </p>
      </div>
      <div className="flex justify-end gap-2 px-4 py-3">
        <button
          type="button"
          className="rounded border border-[var(--surface1)] px-3 py-1 text-[11px] text-[var(--subtext1)] transition-colors duration-150 ease-out hover:bg-[var(--surface0)]"
          onClick={() => onOpenChange(false)}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          className="rounded bg-[var(--red)] px-3 py-1 text-[11px] font-semibold text-[var(--crust)] transition-opacity duration-150 ease-out hover:opacity-90"
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
