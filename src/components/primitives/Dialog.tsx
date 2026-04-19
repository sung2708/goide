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
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onOpenChange, open]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div
      ref={dialogRef}
      id={id}
      data-testid={dataTestId}
      role={role}
      aria-modal="true"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      style={style}
      className={className}
      tabIndex={-1}
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
    </div>,
    document.body
  );
}

export default Dialog;
