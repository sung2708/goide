import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

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

    if (!open) {
      if (dialog.open) {
        dialog.close();
      } else {
        dialog.removeAttribute("open");
      }
      return;
    }

    if (dialog.open) {
      return;
    }

    if (typeof dialog.showModal === "function") {
      dialog.showModal();
      return;
    }

    dialog.setAttribute("open", "");
    const handleFallbackKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", handleFallbackKeyDown);
    return () => window.removeEventListener("keydown", handleFallbackKeyDown);
  }, [onOpenChange, open]);

  if (!open) {
    return null;
  }

  return createPortal(
    <dialog
      ref={dialogRef}
      id={id}
      data-testid={dataTestId}
      role={role}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      style={style}
      className={className}
      tabIndex={-1}
      onCancel={() => {
        onOpenChange(false);
      }}
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
    </dialog>,
    document.body
  );
}

export default Dialog;
