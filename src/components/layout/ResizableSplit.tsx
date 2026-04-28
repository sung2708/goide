import { useCallback, useEffect, useRef } from "react";
import { cn } from "../../lib/utils/cn";

type SplitOrientation = "horizontal" | "vertical";
const KEYBOARD_RESIZE_STEP = 16;

export type ResizableSplitProps = {
  orientation: SplitOrientation;
  primary: React.ReactNode;
  secondary: React.ReactNode;
  size: number;
  defaultSize: number;
  minSize: number;
  maxSize: number;
  onResize: (size: number) => void;
  className?: string;
};

function clamp(value: number, minSize: number, maxSize: number): number {
  return Math.min(maxSize, Math.max(minSize, value));
}

function ResizableSplit({
  orientation,
  primary,
  secondary,
  size,
  defaultSize,
  minSize,
  maxSize,
  onResize,
  className,
}: ResizableSplitProps) {
  const dragStartRef = useRef<{ pointerPosition: number; size: number } | null>(null);
  const dragTargetRef = useRef<HTMLDivElement | null>(null);
  const isHorizontal = orientation === "horizontal";
  const resolvedSize = clamp(size, minSize, maxSize);

  const resizeFromPointerPosition = useCallback(
    (pointerPosition: number) => {
      const dragStart = dragStartRef.current;
      if (!dragStart) {
        return;
      }
      const delta = pointerPosition - dragStart.pointerPosition;
      onResize(clamp(dragStart.size + delta, minSize, maxSize));
    },
    [maxSize, minSize, onResize]
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      resizeFromPointerPosition(isHorizontal ? event.clientX : event.clientY);
    },
    [isHorizontal, resizeFromPointerPosition]
  );

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      resizeFromPointerPosition(isHorizontal ? event.clientX : event.clientY);
    },
    [isHorizontal, resizeFromPointerPosition]
  );

  const stopDragging = useCallback(() => {
    dragStartRef.current = null;
    const dragTarget = dragTargetRef.current;
    if (dragTarget) {
      dragTarget.removeEventListener("pointermove", handlePointerMove);
      dragTarget.removeEventListener("pointerup", stopDragging);
      dragTarget.removeEventListener("pointercancel", stopDragging);
      if (typeof dragTarget.releasePointerCapture === "function") {
        try {
          dragTarget.releasePointerCapture(0);
        } catch {
          // best-effort cleanup
        }
      }
    }
    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("mouseup", stopDragging);
    dragTargetRef.current = null;
  }, [handlePointerMove, handleMouseMove]);

  useEffect(() => {
    return () => {
      stopDragging();
    };
  }, [stopDragging]);

  const startDragging = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragTargetRef.current = event.currentTarget;
      dragStartRef.current = {
        pointerPosition: isHorizontal ? event.clientX : event.clientY,
        size: resolvedSize,
      };
      event.currentTarget.addEventListener("pointermove", handlePointerMove);
      event.currentTarget.addEventListener("pointerup", stopDragging);
      event.currentTarget.addEventListener("pointercancel", stopDragging);
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", stopDragging);
    },
    [handlePointerMove, isHorizontal, resolvedSize, stopDragging, handleMouseMove]
  );

  const startMouseDragging = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      dragTargetRef.current = event.currentTarget;
      dragStartRef.current = {
        pointerPosition: isHorizontal ? event.clientX : event.clientY,
        size: resolvedSize,
      };
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", stopDragging);
    },
    [handleMouseMove, isHorizontal, resolvedSize, stopDragging]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Home") {
        event.preventDefault();
        onResize(minSize);
        return;
      }

      if (event.key === "End") {
        event.preventDefault();
        onResize(maxSize);
        return;
      }

      const increaseKey = isHorizontal ? "ArrowRight" : "ArrowDown";
      const decreaseKey = isHorizontal ? "ArrowLeft" : "ArrowUp";

      if (event.key === increaseKey) {
        event.preventDefault();
        onResize(clamp(resolvedSize + KEYBOARD_RESIZE_STEP, minSize, maxSize));
        return;
      }

      if (event.key === decreaseKey) {
        event.preventDefault();
        onResize(clamp(resolvedSize - KEYBOARD_RESIZE_STEP, minSize, maxSize));
      }
    },
    [isHorizontal, maxSize, minSize, onResize, resolvedSize]
  );

  const primaryStyle = isHorizontal
    ? { width: resolvedSize, minWidth: minSize, maxWidth: maxSize }
    : { height: resolvedSize, minHeight: minSize, maxHeight: maxSize };

  return (
    <div
      className={cn(
        "flex min-h-0 min-w-0",
        isHorizontal ? "h-full flex-row" : "w-full flex-col",
        className
      )}
      data-testid="resizable-split"
    >
      <div className="min-h-0 min-w-0 overflow-hidden" style={primaryStyle}>
        {primary}
      </div>
      {/* Hit-zone wrapper — provides a larger interactive target while the
          visual separator bar remains 1px thick and centered inside it. */}
      <div
        role="separator"
        aria-orientation={isHorizontal ? "vertical" : "horizontal"}
        aria-valuemin={minSize}
        aria-valuemax={maxSize}
        aria-valuenow={resolvedSize}
        tabIndex={0}
        data-testid="separator-hit-zone"
        className={cn(
          "relative z-50 shrink-0 select-none flex items-center justify-center outline-none focus-visible:bg-[var(--lavender)]",
          isHorizontal ? "-mx-2 w-5 cursor-col-resize" : "-my-2 h-5 cursor-row-resize"
        )}
        style={{ touchAction: "none" }}
        onPointerDown={startDragging}
        onMouseDown={startMouseDragging}
        onDoubleClick={() => onResize(clamp(defaultSize, minSize, maxSize))}
        onKeyDown={handleKeyDown}
      >
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none shrink-0 bg-[var(--border-subtle)] transition-colors duration-100",
            isHorizontal ? "h-full w-px" : "h-px w-full"
          )}
        />
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{secondary}</div>
    </div>
  );
}

export default ResizableSplit;
