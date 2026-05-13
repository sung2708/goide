import { useCallback, useEffect, useRef, useState } from "react";
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
  resizeAnchor?: "start" | "end";
  collapsed?: boolean;
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
  resizeAnchor = "start",
  collapsed = false,
  className,
}: ResizableSplitProps) {
  const dragStartRef = useRef<{ pointerId: number; pointerPosition: number; size: number } | null>(null);
  const dragTargetRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);
  const hasResizedDuringDragRef = useRef(false);
  const pendingPointerPositionRef = useRef<number | null>(null);
  const resizeFrameHandleRef = useRef<number | null>(null);
  const isHorizontal = orientation === "horizontal";
  const resolvedSize = clamp(size, minSize, maxSize);
  const [liveSize, setLiveSize] = useState(resolvedSize);
  const liveSizeRef = useRef(resolvedSize);

  useEffect(() => {
    liveSizeRef.current = liveSize;
  }, [liveSize]);

  useEffect(() => {
    if (!isDraggingRef.current) {
      setLiveSize(resolvedSize);
    }
  }, [resolvedSize]);

  const resizeFromPointerPosition = useCallback(
    (pointerPosition: number) => {
      const dragStart = dragStartRef.current;
      if (!dragStart) {
        return;
      }
      const rawDelta = pointerPosition - dragStart.pointerPosition;
      const delta = resizeAnchor === "end" ? -rawDelta : rawDelta;
      const nextSize = clamp(dragStart.size + delta, minSize, maxSize);
      if (nextSize !== dragStart.size) {
        hasResizedDuringDragRef.current = true;
      }
      liveSizeRef.current = nextSize;
      setLiveSize(nextSize);
    },
    [maxSize, minSize, resizeAnchor]
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      pendingPointerPositionRef.current = isHorizontal ? event.clientX : event.clientY;
      if (resizeFrameHandleRef.current !== null) {
        return;
      }
      resizeFrameHandleRef.current = window.requestAnimationFrame(() => {
        resizeFrameHandleRef.current = null;
        const pointerPosition = pendingPointerPositionRef.current;
        if (pointerPosition === null) {
          return;
        }
        pendingPointerPositionRef.current = null;
        resizeFromPointerPosition(pointerPosition);
      });
    },
    [isHorizontal, resizeFromPointerPosition]
  );

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      pendingPointerPositionRef.current = isHorizontal ? event.clientX : event.clientY;
      if (resizeFrameHandleRef.current !== null) {
        return;
      }
      resizeFrameHandleRef.current = window.requestAnimationFrame(() => {
        resizeFrameHandleRef.current = null;
        const pointerPosition = pendingPointerPositionRef.current;
        if (pointerPosition === null) {
          return;
        }
        pendingPointerPositionRef.current = null;
        resizeFromPointerPosition(pointerPosition);
      });
    },
    [isHorizontal, resizeFromPointerPosition]
  );

  const stopDragging = useCallback(() => {
    const pointerId = dragStartRef.current?.pointerId;
    const didDrag = isDraggingRef.current;
    isDraggingRef.current = false;
    const dragTarget = dragTargetRef.current;
    if (dragTarget) {
      dragTarget.removeEventListener("pointerup", stopDragging);
      dragTarget.removeEventListener("pointercancel", stopDragging);
      if (typeof dragTarget.releasePointerCapture === "function") {
        try {
          if (pointerId !== undefined) {
            dragTarget.releasePointerCapture(pointerId);
          }
        } catch {
          // best-effort cleanup
        }
      }
    }
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", stopDragging);
    window.removeEventListener("pointercancel", stopDragging);
    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("mouseup", stopDragging);
    if (resizeFrameHandleRef.current !== null) {
      window.cancelAnimationFrame(resizeFrameHandleRef.current);
      resizeFrameHandleRef.current = null;
    }
    const pendingPointerPosition = pendingPointerPositionRef.current;
    if (pendingPointerPosition !== null) {
      resizeFromPointerPosition(pendingPointerPosition);
    }
    pendingPointerPositionRef.current = null;
    dragStartRef.current = null;
    dragTargetRef.current = null;
    if (didDrag && hasResizedDuringDragRef.current) {
      onResize(liveSizeRef.current);
    }
    hasResizedDuringDragRef.current = false;
  }, [handlePointerMove, handleMouseMove, onResize, resizeFromPointerPosition]);

  useEffect(() => {
    return () => {
      stopDragging();
    };
  }, [stopDragging]);

  const startDragging = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (typeof event.currentTarget.setPointerCapture === "function") {
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Window-level listeners below keep dragging working if capture fails.
        }
      }
      dragTargetRef.current = event.currentTarget;
      isDraggingRef.current = true;
      hasResizedDuringDragRef.current = false;
      dragStartRef.current = {
        pointerId: event.pointerId,
        pointerPosition: isHorizontal ? event.clientX : event.clientY,
        size: liveSizeRef.current,
      };
      event.currentTarget.addEventListener("pointerup", stopDragging);
      event.currentTarget.addEventListener("pointercancel", stopDragging);
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", stopDragging);
      window.addEventListener("pointercancel", stopDragging);
    },
    [handlePointerMove, isHorizontal, stopDragging]
  );

  const startMouseDragging = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }
      const supportsPointerEvents =
        typeof window !== "undefined" && typeof window.PointerEvent !== "undefined";
      if (supportsPointerEvents) {
        return;
      }
      event.preventDefault();
      dragTargetRef.current = event.currentTarget;
      isDraggingRef.current = true;
      hasResizedDuringDragRef.current = false;
      dragStartRef.current = {
        pointerId: -1,
        pointerPosition: isHorizontal ? event.clientX : event.clientY,
        size: liveSizeRef.current,
      };
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", stopDragging);
    },
    [handleMouseMove, isHorizontal, stopDragging]
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

      const increaseKey =
        resizeAnchor === "end"
          ? isHorizontal
            ? "ArrowLeft"
            : "ArrowUp"
          : isHorizontal
          ? "ArrowRight"
          : "ArrowDown";
      const decreaseKey =
        resizeAnchor === "end"
          ? isHorizontal
            ? "ArrowRight"
            : "ArrowDown"
          : isHorizontal
          ? "ArrowLeft"
          : "ArrowUp";

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
    [isHorizontal, maxSize, minSize, onResize, resizeAnchor, resolvedSize]
  );

  const displaySize = clamp(liveSize, minSize, maxSize);
  const primaryStyle = collapsed
    ? isHorizontal
      ? { width: 0, minWidth: 0, maxWidth: 0 }
      : { height: 0, minHeight: 0, maxHeight: 0 }
    : isHorizontal
      ? { width: displaySize, minWidth: minSize, maxWidth: maxSize }
      : { height: displaySize, minHeight: minSize, maxHeight: maxSize };

  return (
    <div
      className={cn(
        "flex min-h-0 min-w-0",
        isHorizontal ? "h-full flex-row" : "w-full flex-col",
        className
      )}
      data-testid="resizable-split"
    >
      <div className="min-h-0 min-w-0 overflow-hidden" style={primaryStyle} aria-hidden={collapsed}>
        {primary}
      </div>
      {/* Hit-zone wrapper — provides a larger interactive target while the
          visual separator bar remains 1px thick and centered inside it. */}
      {!collapsed && (
        <div
          role="separator"
          aria-orientation={isHorizontal ? "vertical" : "horizontal"}
          aria-valuemin={minSize}
          aria-valuemax={maxSize}
          aria-valuenow={resolvedSize}
          tabIndex={0}
          data-testid="separator-hit-zone"
          className={cn(
            "group relative z-50 shrink-0 select-none flex items-center justify-center outline-none focus-visible:bg-[var(--bg-active)]",
            isHorizontal ? "w-3 cursor-col-resize" : "h-3 cursor-row-resize"
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
              "pointer-events-none shrink-0 bg-(--border-muted) transition-colors duration-100 group-hover:bg-(--border-active) group-focus-visible:bg-(--border-active)",
              isHorizontal ? "h-full w-px" : "h-px w-full"
            )}
          />
        </div>
      )}
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{secondary}</div>
    </div>
  );
}

export default ResizableSplit;
