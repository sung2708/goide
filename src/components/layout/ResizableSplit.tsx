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
  const isHorizontal = orientation === "horizontal";
  const resolvedSize = clamp(size, minSize, maxSize);

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      const dragStart = dragStartRef.current;
      if (!dragStart) {
        return;
      }

      const pointerPosition = isHorizontal ? event.clientX : event.clientY;
      const delta = pointerPosition - dragStart.pointerPosition;
      onResize(clamp(dragStart.size + delta, minSize, maxSize));
    },
    [isHorizontal, maxSize, minSize, onResize]
  );

  const stopDragging = useCallback(() => {
    dragStartRef.current = null;
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", stopDragging);
  }, [handlePointerMove]);

  useEffect(() => {
    return () => {
      stopDragging();
    };
  }, [stopDragging]);

  const startDragging = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      dragStartRef.current = {
        pointerPosition: isHorizontal ? event.clientX : event.clientY,
        size: resolvedSize,
      };
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", stopDragging);
    },
    [handlePointerMove, isHorizontal, resolvedSize, stopDragging]
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
      <div
        role="separator"
        aria-orientation={isHorizontal ? "vertical" : "horizontal"}
        aria-valuemin={minSize}
        aria-valuemax={maxSize}
        aria-valuenow={resolvedSize}
        tabIndex={0}
        className={cn(
          "shrink-0 bg-[var(--border-subtle)] outline-none transition-colors duration-100 hover:bg-[var(--border-muted)] focus:bg-[var(--lavender)]",
          isHorizontal ? "w-1 cursor-col-resize" : "h-1 cursor-row-resize"
        )}
        onPointerDown={startDragging}
        onDoubleClick={() => onResize(clamp(defaultSize, minSize, maxSize))}
        onKeyDown={handleKeyDown}
      />
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{secondary}</div>
    </div>
  );
}

export default ResizableSplit;
