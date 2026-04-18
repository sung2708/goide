import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

type DialogRole = "dialog" | "alertdialog";

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role?: DialogRole;
  id?: string;
  dataTestId?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  style?: CSSProperties;
  className?: string;
  panelClassName?: string;
  closeOnBackdrop?: boolean;
  children: ReactNode;
};

function Dialog({
  open,
  onOpenChange,
  role = "dialog",
  id,
  dataTestId,
  ariaLabel,
  ariaLabelledBy,
  style,
  className,
  panelClassName,
  closeOnBackdrop = true,
  children,
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (open && !dialog.open) {
      if (typeof dialog.showModal === "function") {
        dialog.showModal();
      } else {
        dialog.setAttribute("open", "true");
      }
      return;
    }

    if (!open && dialog.open) {
      if (typeof dialog.close === "function") {
        dialog.close();
      } else {
        dialog.removeAttribute("open");
      }
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    const handleCancel = (event: Event) => {
      event.preventDefault();
      onOpenChange(false);
    };

    dialog.addEventListener("cancel", handleCancel);
    return () => dialog.removeEventListener("cancel", handleCancel);
  }, [onOpenChange]);

  return (
    <dialog
      ref={dialogRef}
      id={id}
      data-testid={dataTestId}
      role={role}
      aria-modal="true"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      style={style}
      className={className}
      onClick={(event) => {
        if (!closeOnBackdrop) {
          return;
        }
        if (event.target === event.currentTarget) {
          onOpenChange(false);
        }
      }}
    >
      <div className={panelClassName}>{children}</div>
    </dialog>
  );
}

export default Dialog;
